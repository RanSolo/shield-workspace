import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { evaluateMackValidationV0, type MackEvaluationV0, type MackExpectedBindingV0, type MackValidationReportV0 } from "./mack-validation-v0.mjs";
import { missionIntakeV1, type MissionIntakeCandidateV1 } from "./mission-intake-v1.mjs";
import {
  canonicalJson,
  type EvidenceTimestamp,
} from "./mission-v2.mjs";
import {
  deriveMissionCycleIdentityV1,
  runMissionCycle,
  type MissionCycleDependenciesV1,
  type MissionCycleInputV1,
  type MissionCycleResultV1,
  type ProfileAwareJournalSnapshotV1,
} from "./mission-runtime-v1.mjs";
import { evaluatePermission, replayRuntimeInvocationClaimsV1, validatePermissionInvocationContext, type PermissionInvocationContext } from "./permission-v1.mjs";
import { replayProfileAwareMissionJournal } from "./profile-aware-mission-v1.mjs";
import { type RunnerCyclePlan, type RunnerEffectClass, type RunnerModeReference } from "./runner-v1.mjs";
import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
  replaySeatDispatchReceiptsV1,
  type ExecutorHostObservedV1,
  type ExecutorHostUnobservedV1,
  type ExecutorSelfReportObservedV1,
  type ExecutorSelfReportUnavailableV1,
  type RuntimeConfiguredV1,
  type RuntimeHostObservedV1,
  type RuntimeHostUnobservedV1,
  type RuntimeSelfReportObservedV1,
  type RuntimeRequestedV1,
  type RuntimeSelfReportUnavailableV1,
  type SeatDispatchReceiptEventV1,
  type SeatDispatchReceiptProjectionV1,
} from "./seat-dispatch-receipt-v1.mjs";
import {
  CANONICAL_ROLE_IDS,
  isDispatchableRoleId,
  isHumanGateRoleId,
  type CanonicalRoleId,
  type DispatchableRoleId,
  type HumanGateRoleId,
} from "./role-taxonomy-v1.mjs";

export const MISSION_BUILDER_SCHEMA_VERSION = 1 as const;
export const MISSION_BUILDER_CONTRACT_VERSION = "mission.builder.v1" as const;
const APPROVED_ESCALATION_REASONS = ["ambiguous", "failed", "uncertain", "scope_change"] as const;
const APPROVED_STOP_CONDITIONS = ["ambiguous_ownership", "failed_validation", "missing_binding", "invalid_graph", "scope_change", "stale_state", "stale_revision", "replay_failure", "readback_failure", "scope_expansion", "prohibited_merge", "prohibited_publication", "prohibited_deploy", "prohibited_release", "human_simulation", "uncertain_execution"] as const;
export const MISSION_BUILDER_PATTERNS = Object.freeze(["debug", "delivery", "recon", "planning", "review"] as const);
export const MISSION_BUILDER_MAX_REPAIRS = 2 as const;
export const MISSION_BUILDER_MAX_STEPS = 16 as const;

export type MissionPatternV1 = (typeof MISSION_BUILDER_PATTERNS)[number];
export type MissionNodeKindV1 = "runner_step" | "mack_validation" | "human_gate" | "terminal";
export type MissionEdgeConditionV1 = "success" | "repair" | "human_evidence";

export interface MissionParticipantV1 {
  readonly seatId: CanonicalRoleId;
  readonly kind: "dispatchable_seat" | "human_gate";
}

export interface MissionPromptV1 {
  readonly promptId: string;
  readonly seatId: CanonicalRoleId;
  readonly source: "generated" | "hill_edited";
  readonly content: string;
  readonly contentDigest: string;
}

export interface MissionHandoffPacketV1 {
  readonly handoffId: string;
  readonly fromSeatId: "hill" | DispatchableRoleId;
  readonly toSeatId: CanonicalRoleId;
  readonly missionId: string;
  readonly subjectId: string;
  readonly repositoryRevision: string;
  readonly promptId: string;
  readonly evidenceContractIds: readonly string[];
  readonly source: "generated" | "hill_edited";
  readonly content: string;
  readonly contentDigest: string;
}

export interface MissionStepManifestV1 {
  readonly stepId: string;
  readonly nodeId: string;
  readonly seatId: DispatchableRoleId;
  readonly adapter: "mission_cycle" | "mack_host";
  readonly actionId: string;
  readonly effectClass: RunnerEffectClass;
  readonly validationId: string;
  readonly promptId: string;
  readonly handoffId: string;
  readonly maximumAttempts: number;
  readonly requiredCapabilities: readonly string[];
}

export interface MissionCompilationBindingV1 {
  readonly definitionRevision: string;
  readonly validationRevision: string;
  readonly proofreadAcceptanceDigest: string;
}

export interface MissionEvidenceContractV1 {
  readonly evidenceContractId: string;
  readonly nodeId: string;
  readonly kind: "runner_effect" | "mack_report" | "human_authority";
  readonly evidenceKind: "runner_effect" | "mack_report" | "technical_review" | "product_domain_review" | "final_acceptance";
  readonly requiredSeatId: CanonicalRoleId;
  readonly requirementId: string | null;
  readonly authority: "non_authoritative" | "human_authority";
}

export interface MissionGraphNodeV1 {
  readonly nodeId: string;
  readonly kind: MissionNodeKindV1;
  readonly seatId: CanonicalRoleId | null;
  readonly stepId: string | null;
  readonly terminalReason: "complete" | null;
}

export interface MissionGraphEdgeV1 {
  readonly edgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly condition: MissionEdgeConditionV1;
  readonly evidenceContractId: string;
  readonly maximumTraversals: number;
  readonly priority: number;
}

export interface MissionGraphV1 {
  readonly graphRevision: string;
  readonly startNodeId: string;
  readonly nodes: readonly MissionGraphNodeV1[];
  readonly edges: readonly MissionGraphEdgeV1[];
}

export interface MissionDefinitionV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof MISSION_BUILDER_CONTRACT_VERSION;
  readonly authority: "non_authoritative";
  readonly missionId: string;
  readonly subjectId: string;
  readonly objective: string;
  readonly pattern: MissionPatternV1;
  readonly repositoryId: string;
  readonly repositoryRevision: string;
  readonly intakeRevisionId: string;
  readonly templateId: string;
  readonly templateVersion: 1;
  readonly definitionRevision: string;
  readonly participants: readonly MissionParticipantV1[];
  readonly activatedModes: readonly RunnerModeReference[];
  readonly prompts: readonly MissionPromptV1[];
  readonly handoffs: readonly MissionHandoffPacketV1[];
  readonly evidenceContracts: readonly MissionEvidenceContractV1[];
  readonly steps: readonly MissionStepManifestV1[];
  readonly graph: MissionGraphV1;
  readonly repairPolicy: Readonly<{ maximumRepairs: number; exhaustedRoute: "hill" }>;
  readonly escalation: readonly Readonly<{ reason: "ambiguous" | "failed" | "uncertain" | "scope_change"; route: "hill" | "fury" | "coulson" }>[];
  readonly stopConditions: readonly string[];
  readonly stopConditionRoutes: readonly Readonly<{ condition: string; route: "hill" }>[];
  readonly provenance: Readonly<{ generatedDigest: string; editedDigest: string | null; parentDigest: string | null }>;
}

export type MissionProvenanceKindV1 = "definition.generated" | "definition.edited" | "definition.validated" | "proofreading.accepted";

export interface MissionProvenanceRecordV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: "mission.provenance.v1";
  readonly sequence: number;
  readonly recordId: string;
  readonly kind: MissionProvenanceKindV1;
  readonly missionId: string;
  readonly repositoryId: string;
  readonly definitionRevision: string;
  readonly parentDefinitionRevision: string | null;
  readonly repositoryRevision: string;
  readonly actorSeatId: "hill" | "may";
  readonly templateId: string;
  readonly templateVersion: 1;
  readonly intakeRevisionId: string;
  readonly generatedDigest: string;
  readonly editedDigest: string | null;
  readonly editRecord: readonly Readonly<{ target: "prompt" | "handoff"; targetId: string; replacementDigest: string }>[];
  readonly validationRevision: string | null;
  readonly proofreadAcceptanceDigest: string | null;
  readonly previousRecordDigest: string | null;
  readonly actorArtifactId: string;
  readonly actorReceiptId: string | null;
  readonly recordDigest: string;
}

export interface MissionProvenanceProjectionV1 {
  readonly state: "valid";
  readonly records: readonly MissionProvenanceRecordV1[];
  readonly missionId: string;
  readonly repositoryId: string;
  readonly definitionRevision: string;
  readonly parentDefinitionRevision: string | null;
  readonly repositoryRevision: string;
  readonly templateId: string;
  readonly templateVersion: 1;
  readonly intakeRevisionId: string;
  readonly generatedDigest: string;
  readonly editedDigest: string | null;
  readonly validationRevision: string | null;
  readonly proofreadAcceptanceDigest: string | null;
  readonly lastRecordDigest: string;
}

export interface MissionProvenanceStoreV1 {
  acquireLock(input: { missionId: string; lockOwnerId: string }): Promise<{ state: "acquired"; lockToken: string } | { state: "blocked"; code: "lock_held" | "store_unavailable" }>;
  append(input: { missionId: string; lockToken: string; expectedPreviousRecordDigest: string | null; record: MissionProvenanceRecordV1 }): Promise<{ state: "appended" } | { state: "blocked"; code: "conflict" | "lock_lost" | "store_unavailable" } | { state: "uncertain"; code: "recovery_required" }>;
  replay(input: { missionId: string }): Promise<unknown>;
  readExact(input: { missionId: string; recordDigest: string }): Promise<unknown>;
  readActorReceipts(input: { missionId: string }): Promise<unknown>;
  recover(input: { missionId: string; lockOwnerId: string }): Promise<{ state: "recovered" | "blocked"; code?: "store_unavailable" | "manual_recovery_required" }>;
  releaseLock(input: { missionId: string; lockToken: string }): Promise<void>;
}

export type MissionProvenanceAppendResultV1 = Readonly<
  | { state: "recorded"; record: MissionProvenanceRecordV1 }
  | { state: "blocked"; code: "lock_held" | "store_unavailable" | "conflict" | "lock_lost" | "readback_mismatch" }
  | { state: "uncertain"; code: "recovery_required" | "manual_recovery_required" }
>;

export interface MissionStepReceiptV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: "mission.step-receipt.v1";
  readonly sequence: number;
  readonly receiptId: string;
  readonly missionId: string;
  readonly definitionRevision: string;
  readonly graphRevision: string;
  readonly stepId: string;
  readonly attempt: number;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly edgeId: string;
  readonly outcome: "success" | "repair" | "repair_exhausted" | "human_evidence";
  readonly evidenceRefs: readonly string[];
  readonly runnerBinding: Readonly<{
    readonly seatId: CanonicalRoleId;
    configuredRuntime: RuntimeConfiguredV1;
    requestedRuntime: RuntimeRequestedV1;
    runtimeSelfReport: RuntimeSelfReportUnavailableV1 | RuntimeSelfReportObservedV1;
    runtimeHostObserved: RuntimeHostObservedV1 | RuntimeHostUnobservedV1;
    executorSelfReport: ExecutorSelfReportUnavailableV1 | ExecutorSelfReportObservedV1;
    executorHostObserved: ExecutorHostObservedV1 | ExecutorHostUnobservedV1;
  }> | null;
  readonly previousReceiptDigest: string | null;
  readonly receiptDigest: string;
}

export interface MissionStatusProjectionV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: "mission.status.v1";
  readonly missionId: string;
  readonly definitionRevision: string;
  readonly currentState: "ready" | "waiting" | "complete" | "blocked";
  readonly currentNodeId: string;
  readonly activeSeatId: CanonicalRoleId | null;
  readonly completedEvidence: readonly string[];
  readonly nextTransition: string | null;
  readonly stopReason: "terminal" | "human_gate" | "repair_exhausted" | "invalid_replay" | null;
}

export interface MissionHostRuntimeObservationV1 {
  readonly seatId: DispatchableRoleId;
  readonly configuredRuntime: RuntimeConfiguredV1;
  readonly requestedRuntime: RuntimeRequestedV1;
  readonly runtimeSelfReport: RuntimeSelfReportUnavailableV1 | RuntimeSelfReportObservedV1;
  readonly runtimeHostObserved: RuntimeHostObservedV1 | RuntimeHostUnobservedV1;
  readonly executorSelfReport: ExecutorSelfReportUnavailableV1 | ExecutorSelfReportObservedV1;
  readonly executorHostObserved: ExecutorHostObservedV1 | ExecutorHostUnobservedV1;
}

export interface MissionAdvanceHostObservationV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: "mission.advance.host-observation.v1";
  readonly assuranceKind: "host_asserted";
  readonly repositoryRoot: string;
  readonly repositoryId: string;
  readonly repositoryRevision: string;
  readonly configuredJournalPath: string;
  readonly journalSnapshot: ProfileAwareJournalSnapshotV1;
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly activatedModes: readonly RunnerModeReference[];
  readonly actionAllowlist: readonly string[];
  readonly permissionContext: PermissionInvocationContext;
  readonly runtimeBindings: readonly MissionHostRuntimeObservationV1[];
  readonly provenanceRecords: readonly MissionProvenanceRecordV1[];
  readonly stepReceipts: readonly MissionStepReceiptV1[];
  readonly dispatchReceiptEntries: readonly SeatDispatchReceiptEventV1[];
}

export interface MissionAdvanceInputV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: "mission.advance.v1";
  readonly definition: MissionDefinitionV1;
  readonly observation: MissionAdvanceHostObservationV1;
}

export interface MissionStepReceiptStoreV1 {
  append(input: { receipt: MissionStepReceiptV1; expectedPreviousReceiptDigest: string | null }): Promise<{ state: "appended" } | { state: "blocked"; code: "conflict" | "store_unavailable" } | { state: "uncertain"; code: "recovery_required" }>;
  read(): Promise<unknown>;
}

export interface MackHostDispatchDependenciesV1 {
  appendReceipt(event: SeatDispatchReceiptEventV1): Promise<{ state: "appended" } | { state: "blocked"; code: string } | { state: "uncertain"; code: "recovery_required" }>;
  readReceipts(): Promise<unknown>;
  dispatch(handoff: MissionHandoffPacketV1): Promise<{ reportRef: string; report: unknown }>;
  readReport(reportRef: string): Promise<unknown>;
  now(): string;
}

export interface MissionAdvanceDependenciesV1 {
  readonly missionCycle: Omit<MissionCycleDependenciesV1, "getPermissionContext">;
  readonly stepReceiptStore: MissionStepReceiptStoreV1;
  readonly mack: MackHostDispatchDependenciesV1;
}

export type MissionAdvanceReasonV1 =
  | "input_invalid" | "definition_invalid" | "observation_mismatch" | "provenance_stale"
  | "proofreading_required" | "receipt_invalid" | "receipt_conflict" | "repair_exhausted"
  | "human_evidence_required" | "runner_blocked" | "mack_blocked" | "readback_mismatch"
  | "uncertain_execution" | "complete";

export type MissionAdvanceResultV1 = Readonly<{
  outcome: "advanced" | "waiting" | "blocked" | "uncertain" | "complete";
  reasonCode: MissionAdvanceReasonV1;
  dispatchEffects: 0 | 1;
  receipt: MissionStepReceiptV1 | null;
  runnerResult: MissionCycleResultV1 | null;
  mackEvaluation: MackEvaluationV0 | null;
  status: MissionStatusProjectionV1 | null;
}>;

type Plain = Record<string, unknown>;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/u;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u;
const PATTERNS = new Set<string>(MISSION_BUILDER_PATTERNS);

function plain(value: unknown): value is Plain {
  try { return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype; }
  catch { return false; }
}

function exact(value: unknown, fields: readonly string[]): value is Plain {
  if (!plain(value)) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === fields.length && keys.every((key) => typeof key === "string" && fields.includes(key)) && fields.every((field) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, "value") && descriptor.value !== undefined;
  });
}

function dense(value: unknown, maximum = 128): value is readonly unknown[] {
  if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) return false;
  return value.every((_item, index) => Object.hasOwn(value, index));
}

function cloneClosedData(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
  if (typeof value !== "object" || isProxy(value) || seen.has(value)) throw new TypeError("non_closed_data");
  const array = Array.isArray(value);
  if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) throw new TypeError("non_plain_data");
  seen.add(value);
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) throw new TypeError("symbol_key");
  if (array) {
    const allowed = new Set(["length", ...Array.from({ length: value.length }, (_unused, index) => String(index))]);
    if (keys.some((key) => !allowed.has(key as string))) throw new TypeError("array_field");
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("array_accessor");
      output.push(cloneClosedData(descriptor.value, seen));
    }
    seen.delete(value);
    return output;
  }
  const output: Plain = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("object_accessor");
    output[key] = cloneClosedData(descriptor.value, seen);
  }
  seen.delete(value);
  return output;
}

const INTAKE_CANDIDATE_FIELDS = ["state", "schemaVersion", "contractVersion", "authority", "persistence", "repositoryObservation", "issueObservation", "configObservation", "brief", "risk", "requirements", "recommendedModes", "modeActivationState", "participants", "seatGateEnforcement", "artifacts", "communication", "runtimeObservations", "blockers", "pendingHumanGates", "nextAction"] as const;

function validateMissionIntakeCandidateV1(input: unknown): MissionIntakeCandidateV1 | null {
  try {
    const candidate = cloneClosedData(input);
    if (!exact(candidate, INTAKE_CANDIDATE_FIELDS) || !plain(candidate.brief)) return null;
    const brief = candidate.brief;
    if (!dense(brief.participants, 16)) return null;
    const rebuilt = missionIntakeV1({
      schemaVersion: 1,
      contractVersion: "mission.intake.v1",
      configObservation: candidate.configObservation,
      repositoryObservation: candidate.repositoryObservation,
      issueObservation: candidate.issueObservation,
      proposedBrief: {
        missionId: brief.missionId,
        objective: brief.objective,
        subjectId: brief.subjectId,
        riskFlags: brief.riskFlags,
        participantSeatIds: brief.participants.map((participant) => plain(participant) ? participant.seatId : undefined),
        requireSimmons: brief.requireSimmons,
        createdAt: brief.createdAt,
      },
      recommendedModes: candidate.recommendedModes,
      artifacts: candidate.artifacts,
      runtimeObservations: candidate.runtimeObservations,
    });
    return rebuilt.state === "candidate" && canonicalJson(rebuilt) === canonicalJson(candidate) ? rebuilt : null;
  } catch {
    return null;
  }
}

function digest(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256").update(domain).update("\0").update(canonicalJson(value)).digest("base64url")}`;
}

export function compareMissionCanonicalTextV1(left: string, right: string): number {
  const leftBytes = Buffer.from(left, "utf8");
  const rightBytes = Buffer.from(right, "utf8");
  const length = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) if (leftBytes[index] !== rightBytes[index]) return leftBytes[index] - rightBytes[index];
  return leftBytes.length - rightBytes.length;
}

function canonicalModes(modes: readonly RunnerModeReference[]): RunnerModeReference[] {
  return modes.map((mode) => ({ ...mode })).sort((left, right) => compareMissionCanonicalTextV1(canonicalJson(left), canonicalJson(right)));
}

function validMode(value: unknown): value is RunnerModeReference {
  return exact(value, ["modeId", "modeVersion", "seatId", "activationSource"])
    && [value.modeId, value.modeVersion, value.seatId, value.activationSource].every((item) => typeof item === "string" && ID.test(item));
}

function freeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach(freeze);
    return Object.freeze(value);
  }
  if (plain(value)) {
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }
  return value;
}

function withoutRevision(definition: Omit<MissionDefinitionV1, "definitionRevision"> | MissionDefinitionV1): Omit<MissionDefinitionV1, "definitionRevision"> {
  const { definitionRevision: _ignored, ...content } = definition as MissionDefinitionV1;
  return content;
}

function graphWithoutRevision(graph: MissionGraphV1): Omit<MissionGraphV1, "graphRevision"> {
  const { graphRevision: _ignored, ...content } = graph;
  return content;
}

function definitionRevision(content: Omit<MissionDefinitionV1, "definitionRevision">): string {
  return digest("shield.mission-definition.v1", content);
}

function makeProvenanceRecord(input: Omit<MissionProvenanceRecordV1, "schemaVersion" | "contractVersion" | "recordId" | "recordDigest">): MissionProvenanceRecordV1 {
  const base = { schemaVersion: 1 as const, contractVersion: "mission.provenance.v1" as const, ...input };
  const recordId = `provenance:${input.missionId}:${input.sequence}`;
  return freeze({ ...base, recordId, recordDigest: digest("shield.mission-provenance.v1", { ...base, recordId }) });
}

const TEMPLATE: Readonly<Record<MissionPatternV1, Readonly<{ owner: "daisy" | "may" | "fury"; mode: "debugger" | "delivery"; action: string; effect: RunnerEffectClass }>>> = Object.freeze({
  debug: { owner: "daisy", mode: "debugger", action: "mission.debug.recon", effect: "coordination" },
  delivery: { owner: "may", mode: "delivery", action: "mission.delivery.implement", effect: "behavioral_implementation" },
  recon: { owner: "daisy", mode: "debugger", action: "mission.recon.inspect", effect: "coordination" },
  planning: { owner: "fury", mode: "delivery", action: "mission.planning.review", effect: "coordination" },
  review: { owner: "fury", mode: "delivery", action: "mission.review.conformance", effect: "verification" },
});

function participant(candidate: MissionIntakeCandidateV1, seatId: string): boolean {
  return candidate.participants.some((item) => item.seatId === seatId);
}

function buildPrompt(pattern: MissionPatternV1, seatId: CanonicalRoleId, objective: string): string {
  if (isHumanGateRoleId(seatId)) return `Wait for recorded ${seatId} evidence for ${objective}. Do not simulate or infer a human decision.`;
  if (seatId === "mack") return `Validate the exact artifact revision for the ${pattern} mission. Return one closed Mack report; do not authorize execution.`;
  return `Perform the single bounded ${pattern} step owned by ${seatId}: ${objective}. Stop after one runner cycle and report evidence.`;
}

function nodeId(pattern: MissionPatternV1, suffix: string): string { return `node:${pattern}:${suffix}`; }
function stepId(pattern: MissionPatternV1, suffix: string): string { return `step:${pattern}:${suffix}`; }
function evidenceId(pattern: MissionPatternV1, suffix: string): string { return `evidence:${pattern}:${suffix}`; }

function canonicalManifestSteps(pattern: MissionPatternV1, maximumRepairs: number): MissionStepManifestV1[] {
  const spec = TEMPLATE[pattern];
  return [
    { stepId: stepId(pattern, "work"), nodeId: nodeId(pattern, "work"), seatId: spec.owner, adapter: "mission_cycle", actionId: spec.action, effectClass: spec.effect, validationId: `validation:${pattern}:work`, promptId: `prompt:${pattern}:${spec.owner}`, handoffId: `handoff:${pattern}:${spec.owner}`, maximumAttempts: 1, requiredCapabilities: pattern === "delivery" ? ["filesystem_write"] : ["filesystem_read"] },
    { stepId: stepId(pattern, "mack"), nodeId: nodeId(pattern, "mack"), seatId: "mack", adapter: "mack_host", actionId: "mission.mack.validate", effectClass: "verification", validationId: `validation:${pattern}:mack`, promptId: `prompt:${pattern}:mack`, handoffId: `handoff:${pattern}:mack`, maximumAttempts: 1 + maximumRepairs, requiredCapabilities: [] },
  ];
}

function canonicalGraphShape(pattern: MissionPatternV1, maximumRepairs: number, hasSimmons: boolean): Readonly<{ startNodeId: string; nodes: readonly MissionGraphNodeV1[]; edges: readonly MissionGraphEdgeV1[] }> {
  const humanSeats: HumanGateRoleId[] = ["fitz", ...(hasSimmons ? ["simmons" as const] : []), "coulson"];
  const nodes = [
    { nodeId: nodeId(pattern, "work"), kind: "runner_step" as const, seatId: TEMPLATE[pattern].owner, stepId: stepId(pattern, "work"), terminalReason: null },
    { nodeId: nodeId(pattern, "mack"), kind: "mack_validation" as const, seatId: "mack" as const, stepId: stepId(pattern, "mack"), terminalReason: null },
    ...humanSeats.map((seatId) => ({ nodeId: nodeId(pattern, seatId), kind: "human_gate" as const, seatId, stepId: null, terminalReason: null })),
    { nodeId: nodeId(pattern, "complete"), kind: "terminal" as const, seatId: null, stepId: null, terminalReason: "complete" as const },
  ].sort((left, right) => compareMissionCanonicalTextV1(left.nodeId, right.nodeId));
  const edges = ([
    { edgeId: `edge:${pattern}:work:mack`, fromNodeId: nodeId(pattern, "work"), toNodeId: nodeId(pattern, "mack"), condition: "success" as const, evidenceContractId: evidenceId(pattern, "work"), maximumTraversals: 1, priority: 0 },
    { edgeId: `edge:${pattern}:mack:repair`, fromNodeId: nodeId(pattern, "mack"), toNodeId: nodeId(pattern, "mack"), condition: "repair" as const, evidenceContractId: evidenceId(pattern, "mack"), maximumTraversals: maximumRepairs, priority: 1 },
    { edgeId: `edge:${pattern}:mack:${humanSeats[0]}`, fromNodeId: nodeId(pattern, "mack"), toNodeId: nodeId(pattern, humanSeats[0]), condition: "success" as const, evidenceContractId: evidenceId(pattern, "mack"), maximumTraversals: 1, priority: 0 },
    ...humanSeats.map((seatId, index) => ({ edgeId: `edge:${pattern}:${seatId}:${humanSeats[index + 1] ?? "complete"}`, fromNodeId: nodeId(pattern, seatId), toNodeId: nodeId(pattern, humanSeats[index + 1] ?? "complete"), condition: "human_evidence" as const, evidenceContractId: evidenceId(pattern, seatId), maximumTraversals: 1, priority: 0 })),
  ]).sort((left, right) => compareMissionCanonicalTextV1(left.edgeId, right.edgeId));
  return { startNodeId: nodeId(pattern, "work"), nodes, edges };
}

export function buildMissionDefinitionV1(input: unknown): Readonly<{
  state: "built" | "blocked";
  reasonCodes: readonly string[];
  definition: MissionDefinitionV1 | null;
  provenanceRecords: readonly MissionProvenanceRecordV1[];
}> {
  if (!exact(input, ["candidate", "pattern", "activatedModes", "maximumRepairs"]) || !PATTERNS.has(String(input.pattern)) || !dense(input.activatedModes, 16)
    || !input.activatedModes.every(validMode) || !Number.isSafeInteger(input.maximumRepairs) || (input.maximumRepairs as number) < 0 || (input.maximumRepairs as number) > MISSION_BUILDER_MAX_REPAIRS) {
    return { state: "blocked", reasonCodes: ["invalid_builder_input"], definition: null, provenanceRecords: [] };
  }
  const candidate = validateMissionIntakeCandidateV1(input.candidate);
  const pattern = input.pattern as MissionPatternV1;
  const spec = TEMPLATE[pattern];
  if (!candidate || candidate.state !== "candidate" || candidate.authority !== "non_authoritative" || candidate.persistence !== "not_persisted"
    || candidate.blockers.length !== 0
    || !participant(candidate, spec.owner) || !participant(candidate, "hill") || !participant(candidate, "coulson") || !participant(candidate, "fitz")) {
    return { state: "blocked", reasonCodes: ["intake_not_eligible"], definition: null, provenanceRecords: [] };
  }
  const modes = canonicalModes(input.activatedModes as RunnerModeReference[]);
  if (!modes.some((mode) => mode.modeId === spec.mode && mode.seatId === spec.owner) || modes.some((mode, index) => canonicalJson(mode) === canonicalJson(modes[index - 1]))) {
    return { state: "blocked", reasonCodes: ["required_mode_not_activated"], definition: null, provenanceRecords: [] };
  }

  const humanSeats: HumanGateRoleId[] = ["fitz", ...(candidate.brief.requireSimmons ? ["simmons" as const] : []), "coulson"];
  if (humanSeats.some((seat) => !participant(candidate, seat))) {
    return { state: "blocked", reasonCodes: ["human_gate_missing"], definition: null, provenanceRecords: [] };
  }
  const seats: CanonicalRoleId[] = [spec.owner, "mack", ...humanSeats];
  const participants: MissionParticipantV1[] = seats.map((seatId) => ({ seatId, kind: isHumanGateRoleId(seatId) ? "human_gate" : "dispatchable_seat" }));
  const nodes: MissionGraphNodeV1[] = [
    { nodeId: nodeId(pattern, "work"), kind: "runner_step", seatId: spec.owner, stepId: stepId(pattern, "work"), terminalReason: null },
    { nodeId: nodeId(pattern, "mack"), kind: "mack_validation", seatId: "mack", stepId: stepId(pattern, "mack"), terminalReason: null },
    ...humanSeats.map((seatId): MissionGraphNodeV1 => ({ nodeId: nodeId(pattern, seatId), kind: "human_gate", seatId, stepId: null, terminalReason: null })),
    { nodeId: nodeId(pattern, "complete"), kind: "terminal", seatId: null, stepId: null, terminalReason: "complete" },
  ];
  const evidenceContracts: MissionEvidenceContractV1[] = [
    { evidenceContractId: evidenceId(pattern, "work"), nodeId: nodeId(pattern, "work"), kind: "runner_effect", evidenceKind: "runner_effect", requiredSeatId: spec.owner, requirementId: null, authority: "non_authoritative" },
    { evidenceContractId: evidenceId(pattern, "mack"), nodeId: nodeId(pattern, "mack"), kind: "mack_report", evidenceKind: "mack_report", requiredSeatId: "mack", requirementId: null, authority: "non_authoritative" },
    ...humanSeats.map((seatId): MissionEvidenceContractV1 => ({ evidenceContractId: evidenceId(pattern, seatId), nodeId: nodeId(pattern, seatId), kind: "human_authority", evidenceKind: seatId === "fitz" ? "technical_review" : seatId === "simmons" ? "product_domain_review" : "final_acceptance", requiredSeatId: seatId, requirementId: null, authority: "human_authority" })),
  ];
  const edges: MissionGraphEdgeV1[] = ([
    { edgeId: `edge:${pattern}:work:mack`, fromNodeId: nodeId(pattern, "work"), toNodeId: nodeId(pattern, "mack"), condition: "success", evidenceContractId: evidenceId(pattern, "work"), maximumTraversals: 1, priority: 0 },
    { edgeId: `edge:${pattern}:mack:repair`, fromNodeId: nodeId(pattern, "mack"), toNodeId: nodeId(pattern, "mack"), condition: "repair", evidenceContractId: evidenceId(pattern, "mack"), maximumTraversals: input.maximumRepairs as number, priority: 1 },
    { edgeId: `edge:${pattern}:mack:${humanSeats[0]}`, fromNodeId: nodeId(pattern, "mack"), toNodeId: nodeId(pattern, humanSeats[0]), condition: "success", evidenceContractId: evidenceId(pattern, "mack"), maximumTraversals: 1, priority: 0 },
    ...humanSeats.map((seatId, index): MissionGraphEdgeV1 => ({
      edgeId: `edge:${pattern}:${seatId}:${humanSeats[index + 1] ?? "complete"}`,
      fromNodeId: nodeId(pattern, seatId),
      toNodeId: nodeId(pattern, humanSeats[index + 1] ?? "complete"),
      condition: "human_evidence",
      evidenceContractId: evidenceId(pattern, seatId),
      maximumTraversals: 1,
      priority: 0,
    })),
  ] as MissionGraphEdgeV1[]).sort((left, right) => compareMissionCanonicalTextV1(left.edgeId, right.edgeId));
  const graphBase = { startNodeId: nodeId(pattern, "work"), nodes: nodes.sort((left, right) => compareMissionCanonicalTextV1(left.nodeId, right.nodeId)), edges };
  const graph: MissionGraphV1 = { graphRevision: digest("shield.mission-graph.v1", graphBase), ...graphBase };
  const prompts = seats.map((seatId): MissionPromptV1 => {
    const content = buildPrompt(pattern, seatId, candidate.brief.objective);
    return { promptId: `prompt:${pattern}:${seatId}`, seatId, source: "generated", content, contentDigest: digest("shield.mission-prompt.v1", content) };
  });
  const handoffs = seats.map((seatId): MissionHandoffPacketV1 => {
    const prompt = prompts.find((item) => item.seatId === seatId)!;
    const evidenceContractIds = evidenceContracts.filter((item) => item.requiredSeatId === seatId).map((item) => item.evidenceContractId).sort();
    const content = `Generated handoff (${pattern})\nMission: ${candidate.brief.missionId}\nSeat: ${seatId}\nObjective: ${candidate.brief.objective}`;
    return {
      handoffId: `handoff:${pattern}:${seatId}`, fromSeatId: "hill", toSeatId: seatId, missionId: candidate.brief.missionId,
      subjectId: candidate.brief.subjectId, repositoryRevision: candidate.repositoryObservation.headRevision, promptId: prompt.promptId,
      evidenceContractIds, source: "generated", content, contentDigest: digest("shield.mission-handoff.v1", content),
    };
  });
  const steps = canonicalManifestSteps(pattern, input.maximumRepairs as number);
  const generatedDigest = digest("shield.mission-builder.generated.v1", { pattern, candidateRevision: candidate.issueObservation.issueRevisionId, graph, prompts, handoffs, steps });
  const content: Omit<MissionDefinitionV1, "definitionRevision"> = {
    schemaVersion: 1, contractVersion: MISSION_BUILDER_CONTRACT_VERSION, authority: "non_authoritative", missionId: candidate.brief.missionId,
    subjectId: candidate.brief.subjectId, objective: candidate.brief.objective, pattern, repositoryId: candidate.repositoryObservation.repositoryId,
    repositoryRevision: candidate.repositoryObservation.headRevision, intakeRevisionId: candidate.issueObservation.issueRevisionId,
    templateId: `mission-builder:${pattern}`, templateVersion: 1, participants, activatedModes: modes, prompts, handoffs,
    evidenceContracts, steps, graph, repairPolicy: { maximumRepairs: input.maximumRepairs as number, exhaustedRoute: "hill" },
    escalation: [
      { reason: "ambiguous", route: "hill" }, { reason: "failed", route: "hill" },
      { reason: "uncertain", route: "hill" }, { reason: "scope_change", route: "hill" },
    ],
    stopConditions: [...APPROVED_STOP_CONDITIONS],
    stopConditionRoutes: APPROVED_STOP_CONDITIONS.map((condition) => ({ condition, route: "hill" as const })),
    provenance: { generatedDigest, editedDigest: null, parentDigest: null },
  };
  const definition = freeze({ ...content, definitionRevision: definitionRevision(content) });
  const checked = validateMissionDefinitionV1(definition);
  if (checked.state === "invalid") return { state: "blocked", reasonCodes: checked.reasonCodes, definition: null, provenanceRecords: [] };
  const generated = makeProvenanceRecord({
    sequence: 0, kind: "definition.generated", missionId: definition.missionId, definitionRevision: definition.definitionRevision,
    parentDefinitionRevision: null, repositoryId: definition.repositoryId, repositoryRevision: definition.repositoryRevision, actorSeatId: "hill", templateId: definition.templateId,
    templateVersion: 1, intakeRevisionId: definition.intakeRevisionId, generatedDigest, editedDigest: null, editRecord: [], validationRevision: null,
    proofreadAcceptanceDigest: null, previousRecordDigest: null, actorArtifactId: definition.templateId,
    actorReceiptId: null,
  });
  const validationRevision = digest("shield.mission-validation.v1", { definitionRevision: definition.definitionRevision });
  const validated = makeProvenanceRecord({
    sequence: 1, kind: "definition.validated", missionId: definition.missionId, definitionRevision: definition.definitionRevision,
    parentDefinitionRevision: definition.definitionRevision, repositoryId: definition.repositoryId, repositoryRevision: definition.repositoryRevision, actorSeatId: "may", templateId: definition.templateId,
    templateVersion: 1, intakeRevisionId: definition.intakeRevisionId, generatedDigest, editedDigest: null, editRecord: [], validationRevision,
    proofreadAcceptanceDigest: null, previousRecordDigest: generated.recordDigest, actorArtifactId: definition.definitionRevision,
    actorReceiptId: null,
  });
  return { state: "built", reasonCodes: [], definition, provenanceRecords: [generated, validated] };
}

const DEFINITION_FIELDS = ["schemaVersion", "contractVersion", "authority", "missionId", "subjectId", "objective", "pattern", "repositoryId", "repositoryRevision", "intakeRevisionId", "templateId", "templateVersion", "definitionRevision", "participants", "activatedModes", "prompts", "handoffs", "evidenceContracts", "steps", "graph", "repairPolicy", "escalation", "stopConditions", "stopConditionRoutes", "provenance"] as const;

export function validateMissionDefinitionV1(input: unknown): Readonly<{ state: "valid"; value: MissionDefinitionV1; reasonCodes: readonly [] } | { state: "invalid"; value: null; reasonCodes: readonly string[] }> {
  const reasons: string[] = [];
  if (!exact(input, DEFINITION_FIELDS)) return { state: "invalid", value: null, reasonCodes: ["definition_fields_not_closed"] };
  const value = input as unknown as MissionDefinitionV1;
  if (value.schemaVersion !== 1 || value.contractVersion !== MISSION_BUILDER_CONTRACT_VERSION || value.authority !== "non_authoritative" || !PATTERNS.has(value.pattern)
    || !ID.test(value.missionId) || !ID.test(value.subjectId) || !ID.test(value.repositoryId) || !REVISION.test(value.repositoryRevision) || !ID.test(value.intakeRevisionId)
    || !ID.test(value.templateId) || value.templateVersion !== 1 || !DIGEST.test(value.definitionRevision)) reasons.push("definition_identity_invalid");
  if (typeof value.objective !== "string" || value.objective.length === 0 || value.objective.length > 512) reasons.push("objective_invalid");
  if (!dense(value.participants, 16) || !dense(value.activatedModes, 16) || !value.activatedModes.every(validMode) || !dense(value.prompts, 32) || !dense(value.handoffs, 32)
    || !dense(value.evidenceContracts, 32) || !dense(value.steps, MISSION_BUILDER_MAX_STEPS) || !dense(value.stopConditions, 32) || !dense(value.escalation, 16)) reasons.push("definition_collection_invalid");
  const participantIds = new Set<string>();
  for (const item of value.participants ?? []) {
    if (!exact(item, ["seatId", "kind"]) || (!isDispatchableRoleId(item.seatId) && !isHumanGateRoleId(item.seatId))
      || item.kind !== (isHumanGateRoleId(item.seatId) ? "human_gate" : "dispatchable_seat") || participantIds.has(String(item.seatId))) reasons.push("participant_invalid");
    participantIds.add(String(item.seatId));
  }
  if (!participantIds.has("mack") || !participantIds.has("coulson") || !participantIds.has("fitz")) reasons.push("required_participant_missing");
  const spec = TEMPLATE[value.pattern];
  const expectedParticipantIds = new Set<string>([spec?.owner, "mack", "fitz", "coulson", ...(participantIds.has("simmons") ? ["simmons"] : [])]);
  if (!spec || participantIds.size !== expectedParticipantIds.size || [...participantIds].some((seatId) => !expectedParticipantIds.has(seatId))) reasons.push("participant_pattern_invalid");
  if (!spec || !participantIds.has(spec.owner) || !value.activatedModes.some((mode) => mode.modeId === spec.mode && mode.seatId === spec.owner)
    || new Set(value.activatedModes.map((mode) => canonicalJson(mode))).size !== value.activatedModes.length
    || canonicalJson(value.activatedModes) !== canonicalJson(canonicalModes(value.activatedModes))) reasons.push("pattern_mode_invalid");
  const nodeIds = new Set<string>(); const stepIds = new Set<string>(); const edgeIds = new Set<string>(); const evidenceIds = new Set<string>();
  const promptIds = new Set<string>(); const handoffIds = new Set<string>();
  for (const prompt of value.prompts ?? []) {
    if (!exact(prompt, ["promptId", "seatId", "source", "content", "contentDigest"]) || !ID.test(String(prompt.promptId)) || promptIds.has(String(prompt.promptId))
      || !participantIds.has(String(prompt.seatId)) || !["generated", "hill_edited"].includes(String(prompt.source)) || typeof prompt.content !== "string" || prompt.content.length === 0 || prompt.content.length > 4096
      || prompt.contentDigest !== digest("shield.mission-prompt.v1", prompt.content)) reasons.push("prompt_invalid");
    promptIds.add(String(prompt.promptId));
  }
  if (!exact(value.graph, ["graphRevision", "startNodeId", "nodes", "edges"]) || !dense(value.graph?.nodes, 32) || !dense(value.graph?.edges, 64)) reasons.push("graph_invalid");
  for (const node of value.graph?.nodes ?? []) {
    if (!exact(node, ["nodeId", "kind", "seatId", "stepId", "terminalReason"]) || !ID.test(String(node.nodeId)) || nodeIds.has(String(node.nodeId))) reasons.push("node_invalid");
    nodeIds.add(String(node.nodeId));
    if (node.kind === "human_gate" && !isHumanGateRoleId(node.seatId)) reasons.push("human_node_dispatchable");
    if (node.kind === "terminal" ? node.seatId !== null || node.stepId !== null || node.terminalReason !== "complete" : node.terminalReason !== null) reasons.push("terminal_invalid");
    if ((node.kind === "runner_step" || node.kind === "mack_validation") && !isDispatchableRoleId(node.seatId)) reasons.push("dispatch_node_invalid");
  }
  if (!nodeIds.has(value.graph?.startNodeId) || value.graph?.nodes.filter((node) => node.nodeId === value.graph.startNodeId).length !== 1) reasons.push("start_invalid");
  for (const evidence of value.evidenceContracts ?? []) {
    if (!exact(evidence, ["evidenceContractId", "nodeId", "kind", "evidenceKind", "requiredSeatId", "requirementId", "authority"]) || !ID.test(String(evidence.evidenceContractId)) || evidenceIds.has(String(evidence.evidenceContractId)) || !nodeIds.has(String(evidence.nodeId))) reasons.push("evidence_contract_invalid");
    evidenceIds.add(String(evidence.evidenceContractId));
    if (evidence.requirementId !== null && !ID.test(String(evidence.requirementId))) reasons.push("evidence_requirement_invalid");
    if (evidence.kind === "human_authority"
      ? !isHumanGateRoleId(evidence.requiredSeatId) || evidence.authority !== "human_authority" || evidence.requirementId !== null
        || evidence.evidenceKind !== (evidence.requiredSeatId === "fitz" ? "technical_review" : evidence.requiredSeatId === "simmons" ? "product_domain_review" : "final_acceptance")
      : !isDispatchableRoleId(evidence.requiredSeatId) || evidence.authority !== "non_authoritative" || evidence.requirementId !== null
        || evidence.evidenceKind !== evidence.kind) reasons.push("evidence_authority_invalid");
  }
  for (const handoff of value.handoffs ?? []) {
    if (!exact(handoff, ["handoffId", "fromSeatId", "toSeatId", "missionId", "subjectId", "repositoryRevision", "promptId", "evidenceContractIds", "source", "content", "contentDigest"])
      || !ID.test(String(handoff.handoffId)) || handoffIds.has(String(handoff.handoffId)) || !isDispatchableRoleId(handoff.fromSeatId) || !participantIds.has(String(handoff.toSeatId))
      || handoff.missionId !== value.missionId || handoff.subjectId !== value.subjectId || handoff.repositoryRevision !== value.repositoryRevision || !promptIds.has(String(handoff.promptId))
      || !dense(handoff.evidenceContractIds, 32) || handoff.evidenceContractIds.some((item) => !evidenceIds.has(String(item))) || !["generated", "hill_edited"].includes(String(handoff.source))
      || typeof handoff.content !== "string" || handoff.content.length === 0 || handoff.content.length > 4096 || handoff.contentDigest !== digest("shield.mission-handoff.v1", handoff.content)) reasons.push("handoff_invalid");
    handoffIds.add(String(handoff.handoffId));
  }
  for (const seatId of participantIds) {
    const prompts = value.prompts.filter((item) => item.seatId === seatId);
    const handoffs = value.handoffs.filter((item) => item.toSeatId === seatId);
    const expectedEvidence = value.evidenceContracts.filter((item) => item.requiredSeatId === seatId).map((item) => item.evidenceContractId).sort();
    if (prompts.length !== 1 || handoffs.length !== 1 || handoffs[0]?.promptId !== prompts[0]?.promptId
      || canonicalJson(handoffs[0]?.evidenceContractIds) !== canonicalJson(expectedEvidence)) reasons.push("prompt_handoff_relation_invalid");
  }
  for (const step of value.steps ?? []) {
    if (!exact(step, ["stepId", "nodeId", "seatId", "adapter", "actionId", "effectClass", "validationId", "promptId", "handoffId", "maximumAttempts", "requiredCapabilities"])
      || !ID.test(String(step.stepId)) || stepIds.has(String(step.stepId)) || !nodeIds.has(String(step.nodeId)) || !isDispatchableRoleId(step.seatId)
      || !Number.isSafeInteger(step.maximumAttempts) || step.maximumAttempts < 1 || step.maximumAttempts > 1 + MISSION_BUILDER_MAX_REPAIRS || !dense(step.requiredCapabilities, 32)
      || !step.requiredCapabilities.every((item) => typeof item === "string" && ID.test(item)) || !promptIds.has(String(step.promptId)) || !handoffIds.has(String(step.handoffId))) reasons.push("step_invalid");
    stepIds.add(String(step.stepId));
    if (step.adapter === "mack_host" ? step.seatId !== "mack" : step.adapter !== "mission_cycle" || step.seatId === "mack") reasons.push("step_adapter_invalid");
  }
  let runnerSteps = 0;
  for (const node of value.graph?.nodes ?? []) {
    if (node.kind === "runner_step") runnerSteps += 1;
    if (node.stepId !== null && !stepIds.has(node.stepId)) reasons.push("node_step_missing");
    const step = node.stepId === null ? undefined : value.steps.find((item) => item.stepId === node.stepId);
    if (step && (step.nodeId !== node.nodeId || step.seatId !== node.seatId
      || (node.kind === "runner_step" && step.adapter !== "mission_cycle") || (node.kind === "mack_validation" && step.adapter !== "mack_host"))) reasons.push("node_step_relation_invalid");
  }
  if (runnerSteps !== 1) reasons.push("runner_step_count_invalid");
  if (spec && canonicalJson(value.steps) !== canonicalJson(canonicalManifestSteps(value.pattern, value.repairPolicy?.maximumRepairs ?? -1))) reasons.push("step_manifest_invalid");
  for (const edge of value.graph?.edges ?? []) {
    if (!exact(edge, ["edgeId", "fromNodeId", "toNodeId", "condition", "evidenceContractId", "maximumTraversals", "priority"]) || !ID.test(String(edge.edgeId)) || edgeIds.has(String(edge.edgeId))
      || !nodeIds.has(String(edge.fromNodeId)) || !nodeIds.has(String(edge.toNodeId)) || !evidenceIds.has(String(edge.evidenceContractId))
      || !["success", "repair", "human_evidence"].includes(edge.condition) || !Number.isSafeInteger(edge.maximumTraversals) || edge.maximumTraversals < (edge.condition === "repair" ? 0 : 1)
      || edge.maximumTraversals > (edge.condition === "repair" ? MISSION_BUILDER_MAX_REPAIRS : 1) || !Number.isSafeInteger(edge.priority) || edge.priority < 0) reasons.push("edge_invalid");
    edgeIds.add(String(edge.edgeId));
    if (edge.fromNodeId === edge.toNodeId && edge.condition !== "repair") reasons.push("unbounded_cycle");
    const source = value.graph.nodes.find((node) => node.nodeId === edge.fromNodeId);
    const evidence = value.evidenceContracts.find((contract) => contract.evidenceContractId === edge.evidenceContractId);
    if (!source || !evidence || evidence.nodeId !== edge.fromNodeId || evidence.requiredSeatId !== source.seatId
      || (edge.condition === "human_evidence" ? source.kind !== "human_gate" || evidence.kind !== "human_authority"
        : source.kind === "runner_step" ? edge.condition !== "success" || evidence.kind !== "runner_effect"
          : source.kind !== "mack_validation" || evidence.kind !== "mack_report" || !["success", "repair"].includes(edge.condition))) reasons.push("edge_evidence_relation_invalid");
  }
  for (const step of value.steps ?? []) {
    const prompt = value.prompts.find((item) => item.promptId === step.promptId);
    const handoff = value.handoffs.find((item) => item.handoffId === step.handoffId);
    if (!prompt || !handoff || prompt.seatId !== step.seatId || handoff.toSeatId !== step.seatId || handoff.promptId !== prompt.promptId
      || handoff.evidenceContractIds.length === 0 || handoff.evidenceContractIds.some((id) => {
        const evidence = value.evidenceContracts.find((item) => item.evidenceContractId === id);
        return !evidence || evidence.nodeId !== step.nodeId || evidence.requiredSeatId !== step.seatId;
      })) reasons.push("step_handoff_relation_invalid");
  }
  for (const node of value.graph?.nodes ?? []) {
    if (node.kind !== "human_gate") continue;
    const prompt = value.prompts.find((item) => item.seatId === node.seatId);
    const handoff = value.handoffs.find((item) => item.toSeatId === node.seatId);
    const evidence = value.evidenceContracts.find((item) => item.nodeId === node.nodeId);
    if (!prompt || !handoff || !evidence || handoff.promptId !== prompt.promptId || !handoff.evidenceContractIds.includes(evidence.evidenceContractId)
      || evidence.requiredSeatId !== node.seatId) reasons.push("human_gate_relation_invalid");
  }
  const terminals = value.graph?.nodes.filter((node) => node.kind === "terminal") ?? [];
  if (terminals.length === 0 || value.graph?.nodes.some((node) => node.kind !== "terminal" && !value.graph.edges.some((edge) => edge.fromNodeId === node.nodeId && edge.maximumTraversals > 0))) reasons.push("dead_end_node");
  const reachable = new Set<string>([value.graph?.startNodeId]);
  for (let pass = 0; pass < (value.graph?.nodes.length ?? 0); pass += 1) for (const edge of value.graph?.edges ?? []) if (edge.maximumTraversals > 0 && reachable.has(edge.fromNodeId)) reachable.add(edge.toNodeId);
  if ((value.graph?.nodes ?? []).some((node) => !reachable.has(node.nodeId)) || terminals.some((node) => !reachable.has(node.nodeId))) reasons.push("unreachable_node");
  if (canonicalJson(value.graph?.nodes) !== canonicalJson([...(value.graph?.nodes ?? [])].sort((a, b) => compareMissionCanonicalTextV1(a.nodeId, b.nodeId)))
    || canonicalJson(value.graph?.edges) !== canonicalJson([...(value.graph?.edges ?? [])].sort((a, b) => compareMissionCanonicalTextV1(a.edgeId, b.edgeId)))) reasons.push("graph_not_canonical");
  if (value.graph?.graphRevision !== digest("shield.mission-graph.v1", graphWithoutRevision(value.graph))) reasons.push("graph_revision_mismatch");
  if (spec && canonicalJson({ startNodeId: value.graph?.startNodeId, nodes: value.graph?.nodes, edges: value.graph?.edges }) !== canonicalJson(canonicalGraphShape(value.pattern, value.repairPolicy?.maximumRepairs ?? -1, participantIds.has("simmons")))) reasons.push("graph_shape_invalid");
  if (!exact(value.repairPolicy, ["maximumRepairs", "exhaustedRoute"]) || !Number.isSafeInteger(value.repairPolicy.maximumRepairs) || value.repairPolicy.maximumRepairs < 0 || value.repairPolicy.maximumRepairs > MISSION_BUILDER_MAX_REPAIRS || value.repairPolicy.exhaustedRoute !== "hill"
    || value.graph.edges.filter((edge) => edge.condition === "repair").some((edge) => edge.maximumTraversals !== value.repairPolicy.maximumRepairs)) reasons.push("repair_policy_invalid");
  if (canonicalJson(value.escalation) !== canonicalJson(APPROVED_ESCALATION_REASONS.map((reason) => ({ reason, route: "hill" })))) reasons.push("escalation_invalid");
  if (!value.stopConditions.every((item) => typeof item === "string" && ID.test(item)) || new Set(value.stopConditions).size !== value.stopConditions.length
    || canonicalJson(value.stopConditions) !== canonicalJson(APPROVED_STOP_CONDITIONS)
    || !dense(value.stopConditionRoutes, 32) || canonicalJson(value.stopConditionRoutes) !== canonicalJson(APPROVED_STOP_CONDITIONS.map((condition) => ({ condition, route: "hill" })))) reasons.push("stop_condition_invalid");
  if (!exact(value.provenance, ["generatedDigest", "editedDigest", "parentDigest"]) || !DIGEST.test(value.provenance.generatedDigest)
    || (value.provenance.editedDigest !== null && !DIGEST.test(value.provenance.editedDigest)) || (value.provenance.parentDigest !== null && !DIGEST.test(value.provenance.parentDigest))
    || (value.provenance.editedDigest === null) !== (value.provenance.parentDigest === null)) reasons.push("definition_provenance_invalid");
  if (value.definitionRevision !== definitionRevision(withoutRevision(value))) reasons.push("definition_revision_mismatch");
  return reasons.length > 0 ? { state: "invalid", value: null, reasonCodes: Object.freeze([...new Set(reasons)].sort()) } : { state: "valid", value: freeze(value), reasonCodes: [] };
}

const PROVENANCE_FIELDS = ["schemaVersion", "contractVersion", "sequence", "recordId", "kind", "missionId", "repositoryId", "definitionRevision", "parentDefinitionRevision", "repositoryRevision", "actorSeatId", "templateId", "templateVersion", "intakeRevisionId", "generatedDigest", "editedDigest", "editRecord", "validationRevision", "proofreadAcceptanceDigest", "previousRecordDigest", "actorArtifactId", "actorReceiptId", "recordDigest"] as const;

export function replayMissionProvenanceV1(input: unknown): Readonly<{ state: "valid"; value: MissionProvenanceProjectionV1 } | { state: "invalid"; code: string }> {
  if (!dense(input, 256) || input.length === 0) return { state: "invalid", code: "malformed_provenance" };
  let definition = ""; let parentDefinition: string | null = null; let validation: string | null = null; let acceptance: string | null = null;
  let previous: string | null = null; let missionId = ""; let repositoryId = ""; let repositoryRevision = ""; let templateId = ""; let intakeRevisionId = "";
  let generatedDigest = ""; let editedDigest: string | null = null;
  for (let index = 0; index < input.length; index += 1) {
    const record = input[index] as MissionProvenanceRecordV1;
    if (!exact(record, PROVENANCE_FIELDS) || record.schemaVersion !== 1 || record.contractVersion !== "mission.provenance.v1" || record.sequence !== index
      || record.recordId !== `provenance:${record.missionId}:${index}` || record.previousRecordDigest !== previous || !DIGEST.test(record.recordDigest)
      || record.recordDigest !== digest("shield.mission-provenance.v1", (({ recordDigest: _ignored, ...rest }) => rest)(record)) || !dense(record.editRecord, 64)
      || !["definition.generated", "definition.edited", "definition.validated", "proofreading.accepted"].includes(record.kind) || !ID.test(record.missionId) || !ID.test(record.repositoryId) || !DIGEST.test(record.definitionRevision)
      || (record.parentDefinitionRevision !== null && !DIGEST.test(record.parentDefinitionRevision)) || !REVISION.test(record.repositoryRevision) || !["hill", "may"].includes(record.actorSeatId)
      || !ID.test(record.templateId) || record.templateVersion !== 1 || !ID.test(record.intakeRevisionId) || !DIGEST.test(record.generatedDigest) || !ID.test(record.actorArtifactId)
      || (record.editedDigest !== null && !DIGEST.test(record.editedDigest)) || (record.validationRevision !== null && !DIGEST.test(record.validationRevision))
      || (record.proofreadAcceptanceDigest !== null && !DIGEST.test(record.proofreadAcceptanceDigest)) || (record.actorReceiptId !== null && !ID.test(record.actorReceiptId)) || !record.editRecord.every((edit) => exact(edit, ["target", "targetId", "replacementDigest"])
        && ["prompt", "handoff"].includes(String(edit.target)) && ID.test(String(edit.targetId)) && DIGEST.test(String(edit.replacementDigest)))) return { state: "invalid", code: "provenance_conflict" };
    if (index === 0) {
      if (record.kind !== "definition.generated" || record.actorSeatId !== "hill" || record.parentDefinitionRevision !== null || record.editedDigest !== null
        || record.editRecord.length !== 0 || record.validationRevision !== null || record.proofreadAcceptanceDigest !== null) return { state: "invalid", code: "generated_record_missing" };
      missionId = record.missionId; repositoryId = record.repositoryId; definition = record.definitionRevision; repositoryRevision = record.repositoryRevision; templateId = record.templateId;
      intakeRevisionId = record.intakeRevisionId; generatedDigest = record.generatedDigest;
    } else if (record.missionId !== missionId || record.repositoryId !== repositoryId || record.repositoryRevision !== repositoryRevision || record.templateId !== templateId || record.templateVersion !== 1
      || record.intakeRevisionId !== intakeRevisionId || record.generatedDigest !== generatedDigest) return { state: "invalid", code: "mixed_scope" };
    if (index > 0 && record.kind === "definition.generated") return { state: "invalid", code: "generated_record_duplicate" };
    const expectedActorArtifact = record.kind === "definition.generated" ? record.templateId : record.definitionRevision;
    if (record.actorArtifactId !== expectedActorArtifact) return { state: "invalid", code: "actor_artifact_mismatch" };
    if (record.kind === "definition.edited") {
      if (record.actorSeatId !== "hill" || record.parentDefinitionRevision !== definition || record.definitionRevision === definition || record.editedDigest === null
        || record.editRecord.length === 0 || record.validationRevision !== null || record.proofreadAcceptanceDigest !== null
        || canonicalJson(record.editRecord) !== canonicalJson([...record.editRecord].sort((left, right) => compareMissionCanonicalTextV1(`${left.target}:${left.targetId}`, `${right.target}:${right.targetId}`)))
        || new Set(record.editRecord.map((edit) => `${edit.target}:${edit.targetId}`)).size !== record.editRecord.length) return { state: "invalid", code: "edit_record_invalid" };
      parentDefinition = definition; definition = record.definitionRevision; editedDigest = record.editedDigest; validation = null; acceptance = null;
    } else if (record.definitionRevision !== definition || record.editedDigest !== editedDigest) return { state: "invalid", code: "stale_definition" };
    if (record.kind === "definition.validated") {
      const expectedValidation = digest("shield.mission-validation.v1", { definitionRevision: record.definitionRevision });
      if (record.actorSeatId !== "may" || record.parentDefinitionRevision !== definition || record.validationRevision !== expectedValidation || record.proofreadAcceptanceDigest !== null || record.editRecord.length !== 0) return { state: "invalid", code: "validation_missing" };
      validation = record.validationRevision; acceptance = null;
    }
    if (record.kind === "proofreading.accepted") {
      const expectedAcceptance = validation === null ? null : digest("shield.mission-proofreading.v1", { definitionRevision: record.definitionRevision, validationRevision: validation, actorSeatId: "hill" });
      if (validation === null || record.parentDefinitionRevision !== definition || record.validationRevision !== validation || record.actorSeatId !== "hill" || record.proofreadAcceptanceDigest !== expectedAcceptance || record.editRecord.length !== 0) return { state: "invalid", code: "proofreading_stale" };
      acceptance = record.proofreadAcceptanceDigest;
    }
    previous = record.recordDigest;
  }
  return { state: "valid", value: freeze({ state: "valid", records: [...input] as MissionProvenanceRecordV1[], missionId, repositoryId, definitionRevision: definition,
    parentDefinitionRevision: parentDefinition, repositoryRevision, templateId, templateVersion: 1, intakeRevisionId, generatedDigest, editedDigest,
    validationRevision: validation, proofreadAcceptanceDigest: acceptance, lastRecordDigest: previous! }) };
}

function provenanceMatchesDefinition(projection: MissionProvenanceProjectionV1, definition: MissionDefinitionV1): boolean {
  return projection.missionId === definition.missionId && projection.repositoryId === definition.repositoryId && projection.definitionRevision === definition.definitionRevision
    && projection.parentDefinitionRevision === definition.provenance.parentDigest && projection.repositoryRevision === definition.repositoryRevision
    && projection.templateId === definition.templateId && projection.templateVersion === definition.templateVersion
    && projection.intakeRevisionId === definition.intakeRevisionId && projection.generatedDigest === definition.provenance.generatedDigest
    && projection.editedDigest === definition.provenance.editedDigest;
}

function actorReceiptMatches(record: MissionProvenanceRecordV1, dispatch: ReturnType<typeof replaySeatDispatchReceiptsV1>, definition: MissionDefinitionV1 | null): boolean {
  if (dispatch.state === "invalid" || record.actorReceiptId === null) return false;
  const receipt = dispatch.projections.find((item) => item.receiptId === record.actorReceiptId);
  if (!receipt || receipt.state !== "completed" || receipt.accountableSeatId !== record.actorSeatId
    || receipt.parentMissionId !== record.missionId || receipt.parentMissionRevision !== record.definitionRevision || receipt.repositoryId !== record.repositoryId
    || receipt.repositoryRevision !== record.repositoryRevision || receipt.artifactId !== record.actorArtifactId
    || receipt.artifactRevision !== record.definitionRevision || (definition !== null && (receipt.repositoryId !== definition.repositoryId || receipt.subjectId !== definition.subjectId))) return false;
  const runtimeIds = [receipt.configuredRuntime.runtimeId, receipt.requestedRuntime.runtimeId, ...receipt.runtimeHostHistory.map((item) => item.runtimeId)];
  const executorIds = [...receipt.executorHostHistory.map((item) => item.executorId)];
  if (receipt.runtimeHostHistory.length === 0 || receipt.executorHostHistory.length === 0) return false;
  const seats = new Set<string>(CANONICAL_ROLE_IDS);
  return [...runtimeIds, ...executorIds].every((identity) => !seats.has(identity))
    && !runtimeIds.some((identity) => executorIds.includes(identity));
}

export async function appendMissionProvenanceRecordV1(
  store: MissionProvenanceStoreV1,
  record: MissionProvenanceRecordV1,
  lockOwnerId: string,
): Promise<MissionProvenanceAppendResultV1> {
  if (!ID.test(lockOwnerId) || !exact(record, PROVENANCE_FIELDS) || record.actorReceiptId === null) return { state: "blocked", code: "conflict" };
  const acquired = await store.acquireLock({ missionId: record.missionId, lockOwnerId });
  if (acquired.state !== "acquired") return { state: "blocked", code: acquired.code };
  try {
    const existing = await store.replay({ missionId: record.missionId });
    let records: readonly MissionProvenanceRecordV1[];
    if (dense(existing, 256) && existing.length === 0) {
      if (record.sequence !== 0 || record.previousRecordDigest !== null) return { state: "blocked", code: "conflict" };
      records = [];
    } else {
      const current = replayMissionProvenanceV1(existing);
      if (current.state === "invalid" || record.sequence !== current.value.records.length || record.previousRecordDigest !== current.value.lastRecordDigest) return { state: "blocked", code: "conflict" };
      records = current.value.records;
    }
    const proposed = replayMissionProvenanceV1([...records, record]);
    if (proposed.state === "invalid") return { state: "blocked", code: "conflict" };
    const actorReceipts = replaySeatDispatchReceiptsV1(await store.readActorReceipts({ missionId: record.missionId }));
    if (!actorReceiptMatches(record, actorReceipts, null)) return { state: "blocked", code: "conflict" };
    let appended: Awaited<ReturnType<MissionProvenanceStoreV1["append"]>>;
    try { appended = await store.append({ missionId: record.missionId, lockToken: acquired.lockToken, expectedPreviousRecordDigest: record.previousRecordDigest, record }); }
    catch {
      try {
        const recovered = await store.recover({ missionId: record.missionId, lockOwnerId });
        return recovered.state === "recovered" ? { state: "uncertain", code: "recovery_required" } : { state: "uncertain", code: recovered.code === "store_unavailable" ? "recovery_required" : "manual_recovery_required" };
      } catch { return { state: "uncertain", code: "manual_recovery_required" }; }
    }
    if (appended.state === "blocked") return { state: "blocked", code: appended.code };
    if (appended.state === "uncertain") {
      try {
        const recovered = await store.recover({ missionId: record.missionId, lockOwnerId });
        return { state: "uncertain", code: recovered.state === "recovered" || recovered.code === "store_unavailable" ? "recovery_required" : "manual_recovery_required" };
      } catch { return { state: "uncertain", code: "manual_recovery_required" }; }
    }
    let exactRecord: unknown;
    try { exactRecord = await store.readExact({ missionId: record.missionId, recordDigest: record.recordDigest }); }
    catch { return { state: "uncertain", code: "recovery_required" }; }
    if (canonicalJson(exactRecord) !== canonicalJson(record)) return { state: "blocked", code: "readback_mismatch" };
    let replayed: unknown;
    try { replayed = await store.replay({ missionId: record.missionId }); }
    catch { return { state: "uncertain", code: "recovery_required" }; }
    const replay = replayMissionProvenanceV1(replayed);
    if (replay.state === "invalid" || canonicalJson(replay.value.records) !== canonicalJson([...records, record])) return { state: "blocked", code: "readback_mismatch" };
    return { state: "recorded", record };
  } catch {
    return { state: "blocked", code: "store_unavailable" };
  } finally {
    await store.releaseLock({ missionId: record.missionId, lockToken: acquired.lockToken }).catch(() => undefined);
  }
}

export function createMissionProofreadingAcceptanceV1(input: unknown): MissionProvenanceRecordV1 | null {
  if (!exact(input, ["definition", "provenanceRecords"]) || validateMissionDefinitionV1(input.definition).state === "invalid") return null;
  const replay = replayMissionProvenanceV1(input.provenanceRecords);
  const definition = input.definition as unknown as MissionDefinitionV1;
  if (replay.state === "invalid" || !provenanceMatchesDefinition(replay.value, definition) || replay.value.validationRevision === null) return null;
  const acceptance = digest("shield.mission-proofreading.v1", { definitionRevision: definition.definitionRevision, validationRevision: replay.value.validationRevision, actorSeatId: "hill" });
  return makeProvenanceRecord({
    sequence: replay.value.records.length, kind: "proofreading.accepted", missionId: definition.missionId, definitionRevision: definition.definitionRevision,
    parentDefinitionRevision: definition.definitionRevision, repositoryId: definition.repositoryId, repositoryRevision: definition.repositoryRevision, actorSeatId: "hill", templateId: definition.templateId,
    templateVersion: 1, intakeRevisionId: definition.intakeRevisionId, generatedDigest: definition.provenance.generatedDigest, editedDigest: definition.provenance.editedDigest,
    editRecord: [], validationRevision: replay.value.validationRevision, proofreadAcceptanceDigest: acceptance, previousRecordDigest: replay.value.lastRecordDigest, actorArtifactId: definition.definitionRevision, actorReceiptId: null,
  });
}

export function editMissionDefinitionTextV1(input: unknown): Readonly<{ state: "edited" | "blocked"; definition: MissionDefinitionV1 | null; record: MissionProvenanceRecordV1 | null }> {
  if (!exact(input, ["definition", "provenanceRecords", "edits"]) || !dense(input.edits, 64)) return { state: "blocked", definition: null, record: null };
  const checked = validateMissionDefinitionV1(input.definition); const replay = replayMissionProvenanceV1(input.provenanceRecords);
  if (checked.state === "invalid" || replay.state === "invalid" || !provenanceMatchesDefinition(replay.value, checked.value)) return { state: "blocked", definition: null, record: null };
  const edits: { target: "prompt" | "handoff"; targetId: string; replacement: string }[] = [];
  for (const item of input.edits) {
    if (!exact(item, ["target", "targetId", "replacement"]) || !["prompt", "handoff"].includes(String(item.target)) || !ID.test(String(item.targetId)) || typeof item.replacement !== "string" || item.replacement.length === 0 || item.replacement.length > 4096) return { state: "blocked", definition: null, record: null };
    edits.push(item as typeof edits[number]);
  }
  edits.sort((a, b) => compareMissionCanonicalTextV1(`${a.target}:${a.targetId}`, `${b.target}:${b.targetId}`));
  if (new Set(edits.map((item) => `${item.target}:${item.targetId}`)).size !== edits.length) return { state: "blocked", definition: null, record: null };
  let matched = 0;
  const prompts = checked.value.prompts.map((prompt) => { const edit = edits.find((item) => item.target === "prompt" && item.targetId === prompt.promptId); if (!edit) return prompt; matched += 1; return { ...prompt, source: "hill_edited" as const, content: edit.replacement, contentDigest: digest("shield.mission-prompt.v1", edit.replacement) }; });
  const handoffs = checked.value.handoffs.map((handoff) => { const edit = edits.find((item) => item.target === "handoff" && item.targetId === handoff.handoffId); if (!edit) return handoff; matched += 1; return { ...handoff, source: "hill_edited" as const, content: edit.replacement, contentDigest: digest("shield.mission-handoff.v1", edit.replacement) }; });
  if (matched !== edits.length) return { state: "blocked", definition: null, record: null };
  const normalized = edits.map((item) => ({ target: item.target, targetId: item.targetId, replacementDigest: digest("shield.mission-edit-replacement.v1", item.replacement) }));
  const editedDigest = digest("shield.mission-edit.v1", normalized);
  const content: Omit<MissionDefinitionV1, "definitionRevision"> = { ...withoutRevision(checked.value), prompts, handoffs, provenance: { generatedDigest: checked.value.provenance.generatedDigest, editedDigest, parentDigest: checked.value.definitionRevision } };
  const definition = freeze({ ...content, definitionRevision: definitionRevision(content) });
  if (validateMissionDefinitionV1(definition).state === "invalid") return { state: "blocked", definition: null, record: null };
  const record = makeProvenanceRecord({
    sequence: replay.value.records.length, kind: "definition.edited", missionId: definition.missionId, definitionRevision: definition.definitionRevision,
    parentDefinitionRevision: checked.value.definitionRevision, repositoryId: definition.repositoryId, repositoryRevision: definition.repositoryRevision, actorSeatId: "hill", templateId: definition.templateId,
    templateVersion: 1, intakeRevisionId: definition.intakeRevisionId, generatedDigest: definition.provenance.generatedDigest, editedDigest, editRecord: normalized,
    validationRevision: null, proofreadAcceptanceDigest: null, previousRecordDigest: replay.value.lastRecordDigest, actorArtifactId: definition.definitionRevision, actorReceiptId: null,
  });
  return { state: "edited", definition, record };
}

export function createMissionValidationRecordV1(input: unknown): MissionProvenanceRecordV1 | null {
  if (!exact(input, ["definition", "provenanceRecords"])) return null;
  const checked = validateMissionDefinitionV1(input.definition); const replay = replayMissionProvenanceV1(input.provenanceRecords);
  if (checked.state === "invalid" || replay.state === "invalid" || !provenanceMatchesDefinition(replay.value, checked.value)) return null;
  const validationRevision = digest("shield.mission-validation.v1", { definitionRevision: checked.value.definitionRevision });
  return makeProvenanceRecord({
    sequence: replay.value.records.length, kind: "definition.validated", missionId: checked.value.missionId, definitionRevision: checked.value.definitionRevision,
    parentDefinitionRevision: checked.value.definitionRevision, repositoryId: checked.value.repositoryId, repositoryRevision: checked.value.repositoryRevision, actorSeatId: "may", templateId: checked.value.templateId,
    templateVersion: 1, intakeRevisionId: checked.value.intakeRevisionId, generatedDigest: checked.value.provenance.generatedDigest, editedDigest: checked.value.provenance.editedDigest,
    editRecord: [], validationRevision, proofreadAcceptanceDigest: null, previousRecordDigest: replay.value.lastRecordDigest, actorArtifactId: checked.value.definitionRevision, actorReceiptId: null,
  });
}

export function finalizeMissionProvenanceRecordV1(input: unknown): MissionProvenanceRecordV1 | null {
  if (!exact(input, ["proposal", "priorReplay", "actorReceiptEntries", "actorReceiptId"]) || !exact(input.proposal, PROVENANCE_FIELDS)
    || input.proposal.actorReceiptId !== null || typeof input.actorReceiptId !== "string" || !ID.test(input.actorReceiptId)
    || !dense(input.priorReplay, 256) || !dense(input.actorReceiptEntries, 512)) return null;
  const prior = replayMissionProvenanceV1(input.priorReplay);
  if (prior.state === "invalid" || input.proposal.sequence !== prior.value.records.length || input.proposal.previousRecordDigest !== prior.value.lastRecordDigest) return null;
  const proposal = { ...input.proposal, actorReceiptId: input.actorReceiptId, recordDigest: "" } as MissionProvenanceRecordV1;
  const { recordDigest: _ignored, ...content } = proposal;
  const record = { ...proposal, recordDigest: digest("shield.mission-provenance.v1", content) };
  const actorReceipts = replaySeatDispatchReceiptsV1(input.actorReceiptEntries);
  if (!actorReceiptMatches(record, actorReceipts, null)) return null;
  return replayMissionProvenanceV1([...prior.value.records, record]).state === "valid" ? freeze(record) : null;
}

function stepReceiptDigest(receipt: Omit<MissionStepReceiptV1, "receiptDigest">): string { return digest("shield.mission-step-receipt.v1", receipt); }

export function deriveMissionStepIdentityV1(graphRevision: string, stepId: string, attempt: number): string {
  if (!DIGEST.test(graphRevision) || !ID.test(stepId) || !Number.isSafeInteger(attempt) || attempt < 1 || attempt > 1 + MISSION_BUILDER_MAX_REPAIRS) throw new Error("invalid mission step identity");
  return `step-receipt:${digest("shield.mission-step-identity.v1", { graphRevision, stepId, attempt }).slice(7)}`;
}

function makeStepReceipt(input: Omit<MissionStepReceiptV1, "schemaVersion" | "contractVersion" | "receiptId" | "receiptDigest">): MissionStepReceiptV1 {
  const receiptId = deriveMissionStepIdentityV1(input.graphRevision, input.stepId, input.attempt);
  const base = { schemaVersion: 1 as const, contractVersion: "mission.step-receipt.v1" as const, receiptId, ...input };
  return freeze({ ...base, receiptDigest: stepReceiptDigest(base) });
}

function validRunnerReceiptBinding(value: unknown): boolean {
  return plain(value) && exact(value, ["seatId", "configuredRuntime", "requestedRuntime", "runtimeSelfReport", "runtimeHostObserved", "executorSelfReport", "executorHostObserved"])
    && typeof value.seatId === "string" && CANONICAL_ROLE_IDS.includes(value.seatId as CanonicalRoleId)
    && plain(value.configuredRuntime) && plain(value.requestedRuntime) && plain(value.runtimeSelfReport) && plain(value.runtimeHostObserved)
    && plain(value.executorSelfReport) && plain(value.executorHostObserved);
}

function runnerReceiptBindingMatches(value: MissionStepReceiptV1["runnerBinding"], runtime: MissionHostRuntimeObservationV1): boolean {
  return value !== null && value.seatId === runtime.seatId && canonicalJson(value.configuredRuntime) === canonicalJson(runtime.configuredRuntime)
    && canonicalJson(value.requestedRuntime) === canonicalJson(runtime.requestedRuntime)
    && canonicalJson(value.runtimeSelfReport) === canonicalJson(runtime.runtimeSelfReport)
    && canonicalJson(value.runtimeHostObserved) === canonicalJson(runtime.runtimeHostObserved)
    && canonicalJson(value.executorSelfReport) === canonicalJson(runtime.executorSelfReport)
    && canonicalJson(value.executorHostObserved) === canonicalJson(runtime.executorHostObserved);
}

function replayStepReceipts(definition: MissionDefinitionV1, input: unknown): { state: "valid"; currentNodeId: string; receipts: readonly MissionStepReceiptV1[]; edgeCounts: Map<string, number>; evidence: string[]; exhausted: boolean } | { state: "invalid" } {
  if (!dense(input, 256)) return { state: "invalid" };
  let current = definition.graph.startNodeId; let previous: string | null = null; let exhausted = false; const edgeCounts = new Map<string, number>(); const evidenceRefs: string[] = []; const stepAttempts = new Map<string, number>();
  for (let index = 0; index < input.length; index += 1) {
    const receipt = input[index] as MissionStepReceiptV1;
    const fields = ["schemaVersion", "contractVersion", "sequence", "receiptId", "missionId", "definitionRevision", "graphRevision", "stepId", "attempt", "fromNodeId", "toNodeId", "edgeId", "outcome", "evidenceRefs", "runnerBinding", "previousReceiptDigest", "receiptDigest"];
    if (!exact(receipt, fields) || receipt.sequence !== index || receipt.missionId !== definition.missionId || receipt.definitionRevision !== definition.definitionRevision || receipt.graphRevision !== definition.graph.graphRevision
      || receipt.fromNodeId !== current || receipt.previousReceiptDigest !== previous || !dense(receipt.evidenceRefs, 32) || receipt.receiptDigest !== stepReceiptDigest((({ receiptDigest: _ignored, ...rest }) => rest)(receipt))
      || receipt.receiptId !== deriveMissionStepIdentityV1(receipt.graphRevision, receipt.stepId, receipt.attempt)) return { state: "invalid" };
    const edge = definition.graph.edges.find((item) => item.edgeId === receipt.edgeId);
    const node = definition.graph.nodes.find((item) => item.nodeId === current);
    const evidence = edge && definition.evidenceContracts.find((item) => item.evidenceContractId === edge.evidenceContractId);
    const step = definition.steps.find((item) => item.stepId === receipt.stepId);
    const expectedAttempt = (stepAttempts.get(receipt.stepId) ?? 0) + 1;
    if (!node || (node.kind === "runner_step" ? !validRunnerReceiptBinding(receipt.runnerBinding) : receipt.runnerBinding !== null)) return { state: "invalid" };
    if (!edge || !node || !evidence || edge.fromNodeId !== current || edge.toNodeId !== receipt.toNodeId || evidence.nodeId !== node.nodeId
      || evidence.requiredSeatId !== node.seatId || receipt.evidenceRefs.length !== 1 || !receipt.evidenceRefs.every((item) => typeof item === "string" && ID.test(item))
      || (node.stepId ?? `human:${node.nodeId}`) !== receipt.stepId || receipt.attempt !== expectedAttempt || receipt.attempt > (step?.maximumAttempts ?? 1)
      || (receipt.outcome === "human_evidence" ? evidence.kind !== "human_authority" : node.kind === "runner_step" ? evidence.kind !== "runner_effect" : evidence.kind !== "mack_report")) return { state: "invalid" };
    stepAttempts.set(receipt.stepId, receipt.attempt);
    if (receipt.outcome === "repair_exhausted") {
      if (node.kind !== "mack_validation" || edge.condition !== "repair" || receipt.toNodeId !== current || (edgeCounts.get(edge.edgeId) ?? 0) < edge.maximumTraversals || exhausted) return { state: "invalid" };
      exhausted = true; previous = receipt.receiptDigest; evidenceRefs.push(...receipt.evidenceRefs); continue;
    }
    const count = (edgeCounts.get(edge.edgeId) ?? 0) + 1;
    if (count > edge.maximumTraversals || receipt.outcome !== edge.condition) return { state: "invalid" };
    edgeCounts.set(edge.edgeId, count); current = receipt.toNodeId; previous = receipt.receiptDigest; evidenceRefs.push(...receipt.evidenceRefs);
  }
  return { state: "valid", currentNodeId: current, receipts: input as MissionStepReceiptV1[], edgeCounts, evidence: evidenceRefs, exhausted };
}

function receiptEvidenceMatchesObservation(definition: MissionDefinitionV1, observation: MissionAdvanceHostObservationV1, receipts: readonly MissionStepReceiptV1[]): boolean {
  const dispatch = replaySeatDispatchReceiptsV1(observation.dispatchReceiptEntries);
  if (dispatch.state === "invalid") return false;
  return receipts.every((receipt) => {
    const edge = definition.graph.edges.find((item) => item.edgeId === receipt.edgeId);
    const contract = edge && definition.evidenceContracts.find((item) => item.evidenceContractId === edge.evidenceContractId);
    const node = definition.graph.nodes.find((item) => item.nodeId === receipt.fromNodeId);
    const reference = receipt.evidenceRefs[0];
    if (!edge || !contract || !node || contract.nodeId !== node.nodeId || contract.requiredSeatId !== node.seatId || typeof reference !== "string") return false;
    if (contract.kind === "runner_effect") {
      const step = definition.steps.find((item) => item.stepId === receipt.stepId);
      const runtimeBinding = step && observation.runtimeBindings.find((item) => item.seatId === step.seatId);
      return !!step && observation.journalSnapshot.projection.effects.some((effect) => effect.effectKey === reference && effect.outcome === "completed"
        && effect.seatId === step.seatId && effect.actionId === step.actionId && effect.effectClass === step.effectClass
        && effect.subjectId === definition.subjectId && effect.revisionId === observation.journalSnapshot.projection.brief.revisionId
        && !!runtimeBinding && runnerReceiptBindingMatches(receipt.runnerBinding, runtimeBinding));
    }
    if (contract.kind === "mack_report") {
      const step = definition.steps.find((item) => item.stepId === receipt.stepId);
      const identity = step && mackDispatchIdentity(definition, observation, step, receipt.attempt);
      return !!identity && dispatch.projections.some((projection) => projection.state === "completed" && projection.receiptId === identity.receiptId
        && projection.dispatchId === identity.dispatchId && projection.childTaskId === identity.childTaskId && projection.childSessionId === identity.childSessionId
        && projection.parentMissionId === definition.missionId && projection.parentMissionRevision === definition.definitionRevision
        && projection.parentSessionId === observation.sessionId && projection.repositoryId === definition.repositoryId && projection.repositoryWorkspaceId === observation.workspaceId
        && projection.repositoryRevision === definition.repositoryRevision && projection.subjectId === definition.subjectId && projection.subjectRevision === identity.subjectRevision
        && projection.artifactId === identity.handoff.handoffId && projection.artifactRevision === identity.handoff.contentDigest
        && mackBindingHistoryMatches(projection, identity.runtime)
        && projection.outputEvidenceRefs?.includes(reference));
    }
    const requirements = observation.journalSnapshot.projection.requirements.filter((requirement) => requirement.requiredRoleId === contract.requiredSeatId
      && requirement.evidenceKind === contract.evidenceKind && requirement.revisionId === observation.journalSnapshot.projection.brief.revisionId);
    return requirements.length === 1 && observation.journalSnapshot.projection.evidence.some((evidence) => evidence.evidenceId === reference
      && evidence.requirementId === requirements[0].requirementId && evidence.missionId === definition.missionId && evidence.revisionId === requirements[0].revisionId
      && evidence.seatId === contract.requiredSeatId && evidence.evidenceKind === contract.evidenceKind && evidence.decision === "approved");
  });
}

async function runnerPermissionClaimsMatch(definition: MissionDefinitionV1, observation: MissionAdvanceHostObservationV1, receipts: readonly MissionStepReceiptV1[], dependencies: MissionAdvanceDependenciesV1): Promise<boolean> {
  const runnerReceipts = receipts.filter((receipt) => definition.steps.some((step) => step.stepId === receipt.stepId && step.adapter === "mission_cycle"));
  if (runnerReceipts.length === 0) return true;
  let replayed: ReturnType<typeof replayRuntimeInvocationClaimsV1>;
  try { replayed = replayRuntimeInvocationClaimsV1(await dependencies.missionCycle.permissionAudit.read()); } catch { return false; }
  if (replayed.state === "invalid") return false;
  return runnerReceipts.every((receipt) => {
    const step = definition.steps.find((item) => item.stepId === receipt.stepId);
    const runtime = step && observation.runtimeBindings.find((item) => item.seatId === step.seatId);
    const reference = receipt.evidenceRefs[0];
    if (!step || !runtime || typeof reference !== "string") return false;
    return replayed.value.some((record) => record.recordType === "tool.invocation" && record.outcome === "allow"
      && record.missionId === definition.missionId && record.subjectId === definition.subjectId && record.revisionId === observation.journalSnapshot.projection.brief.revisionId
      && record.seatId === step.seatId && record.actionId === step.actionId && record.effectClass === step.effectClass && record.effectKey === reference
      && record.repositoryId === definition.repositoryId
      && record.reasoningRuntimeId === (runtime.runtimeHostObserved.kind === "runtime.host_observed" ? runtime.runtimeHostObserved.runtimeId : null)
      && record.toolExecutorId === (runtime.executorHostObserved.kind === "executor.host_observed" ? runtime.executorHostObserved.executorId : null));
  });
}

export function projectMissionStatusV1(definitionInput: unknown, receiptsInput: unknown): MissionStatusProjectionV1 | null {
  const checked = validateMissionDefinitionV1(definitionInput);
  if (checked.state === "invalid") return null;
  const replay = replayStepReceipts(checked.value, receiptsInput);
  if (replay.state === "invalid") return freeze({ schemaVersion: 1, contractVersion: "mission.status.v1", missionId: checked.value.missionId, definitionRevision: checked.value.definitionRevision, currentState: "blocked", currentNodeId: checked.value.graph.startNodeId, activeSeatId: null, completedEvidence: [], nextTransition: null, stopReason: "invalid_replay" });
  const node = checked.value.graph.nodes.find((item) => item.nodeId === replay.currentNodeId)!;
  const outgoing = checked.value.graph.edges.filter((edge) => edge.fromNodeId === node.nodeId && (replay.edgeCounts.get(edge.edgeId) ?? 0) < edge.maximumTraversals).sort((a, b) => a.priority - b.priority || compareMissionCanonicalTextV1(a.edgeId, b.edgeId));
  const completed = [...new Set(replay.evidence)].sort();
  return freeze({
    schemaVersion: 1, contractVersion: "mission.status.v1", missionId: checked.value.missionId, definitionRevision: checked.value.definitionRevision,
    currentState: replay.exhausted ? "blocked" : node.kind === "terminal" ? "complete" : node.kind === "human_gate" ? "waiting" : "ready", currentNodeId: node.nodeId,
    activeSeatId: node.seatId, completedEvidence: completed, nextTransition: replay.exhausted ? null : outgoing[0]?.edgeId ?? null,
    stopReason: replay.exhausted ? "repair_exhausted" : node.kind === "terminal" ? "terminal" : node.kind === "human_gate" ? "human_gate" : outgoing.length === 0 ? "repair_exhausted" : null,
  });
}

function blocked(reasonCode: MissionAdvanceReasonV1, status: MissionStatusProjectionV1 | null = null, outcome: "blocked" | "waiting" | "uncertain" = "blocked"): MissionAdvanceResultV1 {
  return { outcome, reasonCode, dispatchEffects: 0, receipt: null, runnerResult: null, mackEvaluation: null, status };
}

function runnerDispatchEffects(result: MissionCycleResultV1): 0 | 1 {
  return result.outcome === "advanced" || (result.outcome === "uncertain" && (result.reasonCode === "effect_readback_mismatch" || result.reasonCode === "effect_outcome_uncertain" || result.reasonCode === "executor_uncertain" || result.reasonCode === "recovery_required")) ? 1 : 0;
}

function validEvidenceRefs(value: unknown): value is readonly string[] {
  return dense(value, 16) && value.every((item) => typeof item === "string" && ID.test(item));
}

function validRuntime(value: unknown): value is MissionHostRuntimeObservationV1 {
  const candidate = value as MissionHostRuntimeObservationV1;
  if (!exact(value, ["seatId", "configuredRuntime", "requestedRuntime", "runtimeSelfReport", "runtimeHostObserved", "executorSelfReport", "executorHostObserved"]) || !isDispatchableRoleId(candidate.seatId)) return false;
  if (!exact(candidate.configuredRuntime, ["kind", "runtimeId", "model"]) || candidate.configuredRuntime.kind !== "runtime.configured" || !ID.test(candidate.configuredRuntime.runtimeId) || !ID.test(candidate.configuredRuntime.model)) return false;
  if (!exact(candidate.requestedRuntime, ["kind", "runtimeId", "model"]) || candidate.requestedRuntime.kind !== "runtime.requested" || !ID.test(candidate.requestedRuntime.runtimeId) || !ID.test(candidate.requestedRuntime.model)) return false;
  const selfRuntime = candidate.runtimeSelfReport;
  if (plain(selfRuntime) && selfRuntime.kind === "runtime.self_report.unavailable") {
    if (!exact(selfRuntime, ["kind", "reason"]) || selfRuntime.reason !== "not_reported") return false;
  } else if (!exact(selfRuntime, ["kind", "runtimeId", "model", "evidenceRefs"]) || selfRuntime.kind !== "runtime.self_report.observed" || !ID.test(selfRuntime.runtimeId) || !ID.test(selfRuntime.model) || !validEvidenceRefs(selfRuntime.evidenceRefs)) return false;
  const hostRuntime = candidate.runtimeHostObserved;
  if (plain(hostRuntime) && hostRuntime.kind === "runtime.host_observed.unavailable") {
    if (!exact(hostRuntime, ["kind", "reason"]) || hostRuntime.reason !== "unobserved") return false;
  } else if (!exact(hostRuntime, ["kind", "runtimeId", "model", "evidenceRefs"]) || hostRuntime.kind !== "runtime.host_observed" || !ID.test(hostRuntime.runtimeId) || !ID.test(hostRuntime.model) || !validEvidenceRefs(hostRuntime.evidenceRefs)) return false;
  const selfExecutor = candidate.executorSelfReport;
  if (plain(selfExecutor) && selfExecutor.kind === "executor.self_report.unavailable") {
    if (!exact(selfExecutor, ["kind", "reason"]) || selfExecutor.reason !== "not_reported") return false;
  } else if (!exact(selfExecutor, ["kind", "executorId", "evidenceRefs"]) || selfExecutor.kind !== "executor.self_report.observed" || !ID.test(selfExecutor.executorId) || !validEvidenceRefs(selfExecutor.evidenceRefs)) return false;
  const hostExecutor = candidate.executorHostObserved;
  if (plain(hostExecutor) && hostExecutor.kind === "executor.host_observed.unavailable") {
    if (!exact(hostExecutor, ["kind", "reason"]) || hostExecutor.reason !== "not_observed") return false;
  } else if (!exact(hostExecutor, ["kind", "executorId", "evidenceRefs"]) || hostExecutor.kind !== "executor.host_observed" || !ID.test(hostExecutor.executorId) || !validEvidenceRefs(hostExecutor.evidenceRefs)) return false;
  return true;
}

function validateObservation(definition: MissionDefinitionV1, value: unknown): MissionAdvanceHostObservationV1 | null {
  const fields = ["schemaVersion", "contractVersion", "assuranceKind", "repositoryRoot", "repositoryId", "repositoryRevision", "configuredJournalPath", "journalSnapshot", "workspaceId", "sessionId", "activatedModes", "actionAllowlist", "permissionContext", "runtimeBindings", "provenanceRecords", "stepReceipts", "dispatchReceiptEntries"];
  if (!exact(value, fields) || value.schemaVersion !== 1 || value.contractVersion !== "mission.advance.host-observation.v1" || value.assuranceKind !== "host_asserted"
    || typeof value.repositoryRoot !== "string" || value.repositoryRoot.length === 0 || value.repositoryId !== definition.repositoryId || value.repositoryRevision !== definition.repositoryRevision
    || typeof value.configuredJournalPath !== "string" || value.configuredJournalPath.length === 0 || !ID.test(String(value.workspaceId)) || !ID.test(String(value.sessionId))
    || !dense(value.activatedModes, 16) || !value.activatedModes.every(validMode) || canonicalJson(canonicalModes(value.activatedModes)) !== canonicalJson(definition.activatedModes)
    || !dense(value.actionAllowlist, 64) || !value.actionAllowlist.every((item) => typeof item === "string" && ID.test(item)) || !dense(value.runtimeBindings, 16) || !value.runtimeBindings.every(validRuntime)
    || !dense(value.provenanceRecords, 256) || !dense(value.stepReceipts, 256) || !dense(value.dispatchReceiptEntries, 512)) return null;
  const dispatchableParticipants = definition.participants.filter((participant) => participant.kind === "dispatchable_seat").map((participant) => participant.seatId);
  const bindingSeats = value.runtimeBindings.map((binding) => binding.seatId);
  const identityOwners = new Map<string, string>();
  for (const binding of value.runtimeBindings) {
    if (!dispatchableParticipants.includes(binding.seatId) || bindingSeats.filter((seatId) => seatId === binding.seatId).length !== 1) return null;
    const runtimeIds = [binding.configuredRuntime.runtimeId, binding.requestedRuntime.runtimeId];
    if (binding.runtimeSelfReport.kind === "runtime.self_report.observed") runtimeIds.push(binding.runtimeSelfReport.runtimeId);
    if (binding.runtimeHostObserved.kind === "runtime.host_observed") runtimeIds.push(binding.runtimeHostObserved.runtimeId);
    const executorIds = [binding.executorHostObserved.kind === "executor.host_observed" ? binding.executorHostObserved.executorId : null,
      binding.executorSelfReport.kind === "executor.self_report.observed" ? binding.executorSelfReport.executorId : null].filter((item): item is string => item !== null);
    if ([...runtimeIds, ...executorIds].some((identity) => CANONICAL_ROLE_IDS.includes(identity as CanonicalRoleId)) || runtimeIds.some((runtimeId) => executorIds.includes(runtimeId))) return null;
    for (const identity of [...new Set([...runtimeIds, ...executorIds])]) {
      const owner = identityOwners.get(identity);
      if (owner !== undefined && owner !== binding.seatId) return null;
      identityOwners.set(identity, binding.seatId);
    }
  }
  if (bindingSeats.length !== dispatchableParticipants.length || new Set(bindingSeats).size !== bindingSeats.length) return null;
  if (!exact(value.journalSnapshot, ["entries", "projection", "journalDigest"]) || !dense(value.journalSnapshot.entries, 4096) || typeof value.journalSnapshot.journalDigest !== "string") return null;
  const replay = replayProfileAwareMissionJournal(value.journalSnapshot.entries);
  const journalDigest = `sha256:${createHash("sha256").update(canonicalJson(value.journalSnapshot.entries)).digest("base64url")}`;
  if (replay.state === "invalid" || journalDigest !== value.journalSnapshot.journalDigest || canonicalJson(replay.value) !== canonicalJson(value.journalSnapshot.projection)
    || replay.value.missionId !== definition.missionId || replay.value.brief.subjectId !== definition.subjectId || replay.value.brief.revisionId !== (value.permissionContext as PermissionInvocationContext)?.missionRevisionId
    || canonicalJson(canonicalModes(replay.value.brief.activatedModes)) !== canonicalJson(definition.activatedModes)) return null;
  const permission = validatePermissionInvocationContext(value.permissionContext);
  const permissionSequence = replay.value.execution === "not-started" ? replay.value.lastSequence + 1 : replay.value.lastSequence;
  if (permission.state === "invalid" || permission.value.repositoryId !== definition.repositoryId || permission.value.canonicalWritableRoot !== value.repositoryRoot
    || permission.value.artifactRevisionId !== definition.repositoryRevision || permission.value.evaluatedThroughSequence !== permissionSequence) return null;
  const provenance = replayMissionProvenanceV1(value.provenanceRecords);
  const allowedDefinitionRevisions = new Set(provenance.state === "valid" ? provenance.value.records.map((record) => record.definitionRevision) : [definition.definitionRevision]);
  allowedDefinitionRevisions.add(definition.definitionRevision);
  const dispatchReplay = replaySeatDispatchReceiptsV1(value.dispatchReceiptEntries);
  if (dispatchReplay.state === "invalid" || dispatchReplay.projections.some((receipt) => receipt.parentMissionId !== definition.missionId
    || !allowedDefinitionRevisions.has(receipt.parentMissionRevision) || receipt.parentSessionId !== value.sessionId || receipt.repositoryId !== definition.repositoryId
    || receipt.repositoryWorkspaceId !== value.workspaceId || receipt.repositoryRevision !== definition.repositoryRevision || receipt.subjectId !== definition.subjectId)) return null;
  return value as unknown as MissionAdvanceHostObservationV1;
}

function provenanceActorsValidated(definition: MissionDefinitionV1, observation: MissionAdvanceHostObservationV1, records: readonly MissionProvenanceRecordV1[]): boolean {
  const dispatch = replaySeatDispatchReceiptsV1(observation.dispatchReceiptEntries);
  if (dispatch.state === "invalid") return false;
  return records.every((record) => actorReceiptMatches(record, dispatch, definition));
}

function nextLogState(entries: readonly SeatDispatchReceiptEventV1[]): { logSequence: number; previousLogDigest: string | null } {
  const last = entries[entries.length - 1]; return { logSequence: last ? last.logSequence + 1 : 0, previousLogDigest: last?.entryDigest ?? null };
}

function mackDispatchIdentity(definition: MissionDefinitionV1, observation: MissionAdvanceHostObservationV1, step: MissionStepManifestV1, attempt: number) {
  const runtime = observation.runtimeBindings.find((item) => item.seatId === "mack");
  const handoff = definition.handoffs.find((item) => item.handoffId === step.handoffId);
  if (!runtime || !handoff) return null;
  const short = digest("shield.mack-dispatch.v1", { graphRevision: definition.graph.graphRevision, stepId: step.stepId, attempt }).slice(7);
  return {
    receiptId: `receipt:${short}`, dispatchId: `dispatch:${short}`, childTaskId: `task:${short}`, childSessionId: `session:${short}`,
    subjectRevision: digest("shield.mission-intake-revision.v1", definition.intakeRevisionId), handoff, runtime,
  } as const;
}

function mackBindingHistoryMatches(projection: SeatDispatchReceiptProjectionV1, runtime: MissionHostRuntimeObservationV1): boolean {
  if (canonicalJson(projection.configuredRuntime) !== canonicalJson(runtime.configuredRuntime)
    || canonicalJson(projection.requestedRuntime) !== canonicalJson(runtime.requestedRuntime)
    || runtime.runtimeHostObserved.kind !== "runtime.host_observed" || runtime.executorHostObserved.kind !== "executor.host_observed"
    || canonicalJson(projection.runtimeHostHistory.at(-1)) !== canonicalJson(runtime.runtimeHostObserved)
    || canonicalJson(projection.executorHostHistory.at(-1)) !== canonicalJson(runtime.executorHostObserved)) return false;
  const runtimeSelfMatches = runtime.runtimeSelfReport.kind === "runtime.self_report.observed"
    ? canonicalJson(projection.runtimeSelfReportHistory.at(-1)) === canonicalJson(runtime.runtimeSelfReport)
    : projection.runtimeSelfReportHistory.length === 0;
  const executorSelfMatches = runtime.executorSelfReport.kind === "executor.self_report.observed"
    ? canonicalJson(projection.executorSelfReportHistory.at(-1)) === canonicalJson(runtime.executorSelfReport)
    : projection.executorSelfReportHistory.length === 0;
  return runtimeSelfMatches && executorSelfMatches;
}

async function runMackAdapter(definition: MissionDefinitionV1, observation: MissionAdvanceHostObservationV1, step: MissionStepManifestV1, attempt: number, dependencies: MackHostDispatchDependenciesV1): Promise<{ state: "success" | "repair" | "blocked" | "uncertain"; evaluation: MackEvaluationV0 | null; reportRef: string | null; dispatchEffects: 0 | 1; reasonCode?: "receipt_invalid" }> {
  const identity = mackDispatchIdentity(definition, observation, step, attempt);
  if (!identity || identity.runtime.runtimeHostObserved.kind !== "runtime.host_observed" || identity.runtime.executorHostObserved.kind !== "executor.host_observed") return { state: "blocked", evaluation: null, reportRef: null, dispatchEffects: 0 };
  const { handoff, runtime, receiptId, dispatchId, childTaskId, childSessionId, subjectRevision } = identity;
  let replay = replaySeatDispatchReceiptsV1(observation.dispatchReceiptEntries);
  if (replay.state === "invalid") return { state: "blocked", evaluation: null, reportRef: null, dispatchEffects: 0, reasonCode: "receipt_invalid" };
  let projection = replay.projections.find((item) => item.receiptId === receiptId);
  if (replay.projections.filter((item) => item.receiptId === receiptId || item.dispatchId === dispatchId).length > (projection ? 1 : 0)) return { state: "blocked", evaluation: null, reportRef: null, dispatchEffects: 0, reasonCode: "receipt_invalid" };
  const expectedIdentity = (item: SeatDispatchReceiptProjectionV1): boolean => item.dispatchId === dispatchId && item.parentMissionId === definition.missionId && item.parentMissionRevision === definition.definitionRevision
    && item.parentSessionId === observation.sessionId && item.childTaskId === childTaskId && item.childSessionId === childSessionId && item.accountableSeatId === "mack"
    && item.repositoryId === definition.repositoryId && item.repositoryWorkspaceId === observation.workspaceId && item.repositoryRevision === definition.repositoryRevision
    && item.subjectId === definition.subjectId && item.subjectRevision === subjectRevision && item.artifactId === handoff.handoffId && item.artifactRevision === handoff.contentDigest
    && mackBindingHistoryMatches(item, runtime);
  if (projection && !expectedIdentity(projection)) return { state: "blocked", evaluation: null, reportRef: null, dispatchEffects: 0, reasonCode: "receipt_invalid" };
  const expected: MackExpectedBindingV0 = { missionId: definition.missionId, subjectId: definition.subjectId, repository: definition.repositoryId, branch: observation.permissionContext.branch, artifactRevisionId: definition.repositoryRevision, approvedTestSurfaces: [] };
  if (projection?.state === "completed") {
    const reportRef = projection.outputEvidenceRefs?.[0]; if (!reportRef) return { state: "blocked", evaluation: null, reportRef: null, dispatchEffects: 0 };
    let report: unknown;
    try { report = await dependencies.readReport(reportRef); } catch { return { state: "uncertain", evaluation: null, reportRef, dispatchEffects: 0 }; }
    if (reportRef !== `mack-report:${digest("shield.mack-report.v1", report).slice(7)}`) return { state: "blocked", evaluation: null, reportRef: null, dispatchEffects: 0 };
    const evaluation = evaluateMackValidationV0(report, expected);
    if (evaluation.state === "invalid") return { state: "blocked", evaluation, reportRef, dispatchEffects: 0 };
    return { state: evaluation.advancementEligibility === "eligible" ? "success" : "repair", evaluation, reportRef, dispatchEffects: 0 };
  }
  if (projection) return { state: "uncertain", evaluation: null, reportRef: null, dispatchEffects: 0 };
  const selfRuntime = runtime.runtimeSelfReport;
  const selfExecutor = runtime.executorSelfReport;
  const log = nextLogState(replay.entries);
  const started = createSeatDispatchStartedEventV1({
    receiptId, dispatchId, parentMissionId: definition.missionId, parentMissionRevision: definition.definitionRevision, parentSessionId: observation.sessionId,
    childTaskId, childSessionId, accountableSeatId: "mack", repositoryId: definition.repositoryId, repositoryWorkspaceId: observation.workspaceId,
    repositoryRevision: definition.repositoryRevision, subjectId: definition.subjectId, subjectRevision, artifactId: handoff.handoffId,
    artifactRevision: handoff.contentDigest, configuredRuntime: runtime.configuredRuntime, requestedRuntime: runtime.requestedRuntime,
    toolExecution: { kind: "tool.execution.not_requested", reason: "not_requested" }, runtimeSelfReport: selfRuntime, runtimeHostObserved: runtime.runtimeHostObserved,
    executorSelfReport: selfExecutor, executorHostObserved: runtime.executorHostObserved, timestamp: dependencies.now(), logSequence: log.logSequence,
    previousLogDigest: log.previousLogDigest, lifecycleSequence: 0, previousLifecycleDigest: null, inputEvidenceRefs: [handoff.contentDigest],
  });
  let appended: Awaited<ReturnType<MackHostDispatchDependenciesV1["appendReceipt"]>>;
  try { appended = await dependencies.appendReceipt(started); } catch { return { state: "uncertain", evaluation: null, reportRef: null, dispatchEffects: 0 }; }
  if (appended.state === "uncertain") return { state: "uncertain", evaluation: null, reportRef: null, dispatchEffects: 0 };
  if (appended.state !== "appended") return { state: "blocked", evaluation: null, reportRef: null, dispatchEffects: 0 };
  try { replay = replaySeatDispatchReceiptsV1(await dependencies.readReceipts()); }
  catch { return { state: "uncertain", evaluation: null, reportRef: null, dispatchEffects: 0 }; }
  if (replay.state === "invalid") return { state: "uncertain", evaluation: null, reportRef: null, dispatchEffects: 0 };
  projection = replay.projections.find((item) => item.receiptId === receiptId);
  if (!projection || projection.state !== "started" || !expectedIdentity(projection)) return { state: "uncertain", evaluation: null, reportRef: null, dispatchEffects: 0 };
  let dispatched: { reportRef: string; report: unknown };
  try { dispatched = await dependencies.dispatch(handoff); }
  catch { return { state: "uncertain", evaluation: null, reportRef: null, dispatchEffects: 1 }; }
  const expectedReportRef = `mack-report:${digest("shield.mack-report.v1", dispatched.report).slice(7)}`;
  if (dispatched.reportRef !== expectedReportRef) return { state: "uncertain", evaluation: null, reportRef: null, dispatchEffects: 1 };
  const evaluation = evaluateMackValidationV0(dispatched.report, expected);
  if (evaluation.state === "invalid") return { state: "uncertain", evaluation, reportRef: dispatched.reportRef, dispatchEffects: 1 };
  const finalLog = nextLogState(replay.entries);
  const completedInput = {
    kind: "dispatch.completed", receiptId, dispatchId, parentMissionId: definition.missionId, parentMissionRevision: definition.definitionRevision,
    parentSessionId: observation.sessionId, childTaskId, childSessionId, accountableSeatId: "mack", repositoryId: definition.repositoryId,
    repositoryWorkspaceId: observation.workspaceId, repositoryRevision: definition.repositoryRevision, subjectId: definition.subjectId,
    subjectRevision, artifactId: handoff.handoffId, artifactRevision: handoff.contentDigest,
    configuredRuntime: runtime.configuredRuntime, requestedRuntime: runtime.requestedRuntime, toolExecution: { kind: "tool.execution.not_requested", reason: "not_requested" },
    runtimeSelfReport: selfRuntime, runtimeHostObserved: runtime.runtimeHostObserved, executorSelfReport: selfExecutor, executorHostObserved: runtime.executorHostObserved,
    timestamp: dependencies.now(), logSequence: finalLog.logSequence, previousLogDigest: finalLog.previousLogDigest, lifecycleSequence: 1,
    previousLifecycleDigest: projection.lastEntryDigest, outputEvidenceRefs: [dispatched.reportRef],
  };
  const completed = createSeatDispatchLifecycleEventV1(completedInput as never);
  let terminalAppend: Awaited<ReturnType<MackHostDispatchDependenciesV1["appendReceipt"]>>;
  try { terminalAppend = await dependencies.appendReceipt(completed); } catch { return { state: "uncertain", evaluation, reportRef: dispatched.reportRef, dispatchEffects: 1 }; }
  if (terminalAppend.state !== "appended") return { state: "uncertain", evaluation, reportRef: dispatched.reportRef, dispatchEffects: 1 };
  let readback: ReturnType<typeof replaySeatDispatchReceiptsV1>;
  try { readback = replaySeatDispatchReceiptsV1(await dependencies.readReceipts()); }
  catch { return { state: "uncertain", evaluation, reportRef: dispatched.reportRef, dispatchEffects: 1 }; }
  const completedProjection = readback.state === "valid" ? readback.projections.find((item) => item.receiptId === receiptId) : undefined;
  if (!completedProjection || completedProjection.state !== "completed" || !expectedIdentity(completedProjection) || completedProjection.outputEvidenceRefs?.[0] !== dispatched.reportRef) return { state: "uncertain", evaluation, reportRef: dispatched.reportRef, dispatchEffects: 1 };
  return { state: evaluation.advancementEligibility === "eligible" ? "success" : "repair", evaluation, reportRef: dispatched.reportRef, dispatchEffects: 1 };
}

async function appendStepReceipt(receipt: MissionStepReceiptV1, expectedReceipts: readonly MissionStepReceiptV1[], store: MissionStepReceiptStoreV1): Promise<"appended" | "blocked" | "uncertain"> {
  let result: Awaited<ReturnType<MissionStepReceiptStoreV1["append"]>>;
  try { result = await store.append({ receipt, expectedPreviousReceiptDigest: receipt.previousReceiptDigest }); }
  catch { return "uncertain"; }
  if (result.state !== "appended") return result.state;
  let readback: unknown;
  try { readback = await store.read(); }
  catch { return "uncertain"; }
  if (!dense(readback, 256) || canonicalJson(readback) !== canonicalJson([...expectedReceipts, receipt])) return "uncertain";
  const exactReceipt = readback.find((item) => plain(item) && item.receiptId === receipt.receiptId);
  try { return canonicalJson(exactReceipt) === canonicalJson(receipt) ? "appended" : "uncertain"; }
  catch { return "uncertain"; }
}

function compileMissionCycleInputRaw(definition: MissionDefinitionV1, observation: MissionAdvanceHostObservationV1, step: MissionStepManifestV1): MissionCycleInputV1 {
  if (validateMissionDefinitionV1(definition).state === "invalid") throw new Error("definition is not canonical");
  const manifest = definition.steps.find((item) => item.stepId === step.stepId);
  const spec = TEMPLATE[definition.pattern];
  const modes = canonicalModes(definition.activatedModes.filter((mode) => mode.seatId === step.seatId));
  if (step.adapter !== "mission_cycle" || step.seatId === "mack" || !manifest || canonicalJson(manifest) !== canonicalJson(step)
    || step.seatId !== spec.owner || !modes.some((mode) => mode.modeId === spec.mode && mode.seatId === spec.owner)) throw new Error("step is not a runner-backed manifest");
  return freeze({
    repositoryRoot: observation.repositoryRoot,
    configuredJournalPath: observation.configuredJournalPath,
    missionId: definition.missionId,
    expectedSubjectId: definition.subjectId,
    expectedRevisionId: observation.journalSnapshot.projection.brief.revisionId,
    expectedSequence: observation.journalSnapshot.projection.lastSequence,
    seatId: step.seatId,
    actionId: step.actionId,
    effectClass: step.effectClass,
    validationId: step.validationId,
    activatedModes: modes,
    actionAllowlist: [...observation.actionAllowlist],
  });
}

export function compileMissionCycleInputV1(definition: MissionDefinitionV1, observation: MissionAdvanceHostObservationV1, step: MissionStepManifestV1, binding: MissionCompilationBindingV1): MissionCycleInputV1 & { readonly compiledArtifactId: string } {
  if (!exact(binding, ["definitionRevision", "validationRevision", "proofreadAcceptanceDigest"])
    || binding.definitionRevision !== definition.definitionRevision
    || !DIGEST.test(binding.validationRevision) || !DIGEST.test(binding.proofreadAcceptanceDigest)) throw new Error("compilation binding is stale");
  const provenance = replayMissionProvenanceV1(observation.provenanceRecords);
  if (provenance.state === "invalid" || provenance.value.definitionRevision !== binding.definitionRevision
    || provenance.value.validationRevision !== binding.validationRevision || provenance.value.proofreadAcceptanceDigest !== binding.proofreadAcceptanceDigest) throw new Error("compilation binding is stale");
  const compiled = compileMissionCycleInputRaw(definition, observation, step);
  return freeze({ ...compiled, compiledArtifactId: digest("shield.mission-cycle-compiled-artifact.v1", {
    definitionRevision: binding.definitionRevision, validationRevision: binding.validationRevision, proofreadAcceptanceDigest: binding.proofreadAcceptanceDigest,
    missionId: compiled.missionId, seatId: compiled.seatId, actionId: compiled.actionId, effectClass: compiled.effectClass,
  }) });
}

export async function advanceMissionV1(input: unknown, dependencies: MissionAdvanceDependenciesV1): Promise<MissionAdvanceResultV1> {
  if (!exact(input, ["schemaVersion", "contractVersion", "definition", "observation"]) || input.schemaVersion !== 1 || input.contractVersion !== "mission.advance.v1") return blocked("input_invalid");
  let checked: ReturnType<typeof validateMissionDefinitionV1>;
  try { checked = validateMissionDefinitionV1(input.definition); } catch { return blocked("definition_invalid"); }
  if (checked.state === "invalid") return blocked("definition_invalid");
  const definition = checked.value;
  let observation: MissionAdvanceHostObservationV1 | null;
  try { observation = validateObservation(definition, input.observation); } catch { observation = null; }
  if (!observation) return blocked("observation_mismatch");
  const provenance = replayMissionProvenanceV1(observation.provenanceRecords);
  if (provenance.state === "invalid" || !provenanceMatchesDefinition(provenance.value, definition)) return blocked("provenance_stale");
  if (!provenanceActorsValidated(definition, observation, provenance.value.records)) return blocked("provenance_stale");
  if (provenance.value.validationRevision === null || provenance.value.proofreadAcceptanceDigest === null) return blocked("proofreading_required");
  const receiptReplay = replayStepReceipts(definition, observation.stepReceipts); if (receiptReplay.state === "invalid") return blocked("receipt_invalid");
  if (!receiptEvidenceMatchesObservation(definition, observation, receiptReplay.receipts)) return blocked("receipt_invalid");
  if (!await runnerPermissionClaimsMatch(definition, observation, receiptReplay.receipts, dependencies)) return blocked("receipt_invalid");
  const status = projectMissionStatusV1(definition, observation.stepReceipts);
  if (receiptReplay.exhausted) return blocked("repair_exhausted", status);
  const node = definition.graph.nodes.find((item) => item.nodeId === receiptReplay.currentNodeId)!;
  if (node.kind === "terminal") return { outcome: "complete", reasonCode: "complete", dispatchEffects: 0, receipt: null, runnerResult: null, mackEvaluation: null, status };
  const outgoing = definition.graph.edges.filter((edge) => edge.fromNodeId === node.nodeId).sort((a, b) => a.priority - b.priority || compareMissionCanonicalTextV1(a.edgeId, b.edgeId));
  const previousReceiptDigest = receiptReplay.receipts.at(-1)?.receiptDigest ?? null;
  if (node.kind === "human_gate") {
    const edge = outgoing.find((item) => item.condition === "human_evidence");
    const contract = edge && definition.evidenceContracts.find((item) => item.evidenceContractId === edge.evidenceContractId && item.nodeId === node.nodeId
      && item.kind === "human_authority" && item.requiredSeatId === node.seatId);
    const requirements = contract ? observation.journalSnapshot.projection.requirements.filter((item) => item.requiredRoleId === contract.requiredSeatId
      && item.evidenceKind === contract.evidenceKind && item.revisionId === observation.journalSnapshot.projection.brief.revisionId
      && item.phase === (contract.requiredSeatId === "coulson" ? "final_acceptance" : "execution")) : [];
    const evidence = requirements.length === 1 ? observation.journalSnapshot.projection.evidence.filter((item) => item.requirementId === requirements[0].requirementId
      && item.seatId === contract!.requiredSeatId && item.evidenceKind === contract!.evidenceKind && item.missionId === definition.missionId
      && item.revisionId === observation.journalSnapshot.projection.brief.revisionId && item.decision === "approved") : [];
    if (!edge || !contract || evidence.length !== 1) return blocked("human_evidence_required", status, "waiting");
    const receipt = makeStepReceipt({ sequence: receiptReplay.receipts.length, missionId: definition.missionId, definitionRevision: definition.definitionRevision, graphRevision: definition.graph.graphRevision,
      stepId: `human:${node.nodeId}`, attempt: 1, fromNodeId: node.nodeId, toNodeId: edge.toNodeId, edgeId: edge.edgeId, outcome: "human_evidence", evidenceRefs: [evidence[0].evidenceId], runnerBinding: null, previousReceiptDigest });
    const appended = await appendStepReceipt(receipt, receiptReplay.receipts, dependencies.stepReceiptStore);
    if (appended !== "appended") return blocked(appended === "uncertain" ? "uncertain_execution" : "readback_mismatch", status, appended === "uncertain" ? "uncertain" : "blocked");
    return { outcome: "advanced", reasonCode: "complete", dispatchEffects: 0, receipt, runnerResult: null, mackEvaluation: null, status: projectMissionStatusV1(definition, [...observation.stepReceipts, receipt]) };
  }
  const step = definition.steps.find((item) => item.stepId === node.stepId)!;
  const priorAttempts = receiptReplay.receipts.filter((receipt) => receipt.stepId === step.stepId).length;
  const attempt = priorAttempts + 1;
  if (attempt > step.maximumAttempts) return blocked("repair_exhausted", status);
  if (step.adapter === "mission_cycle") {
    if (!observation.actionAllowlist.includes(step.actionId)) return blocked("observation_mismatch", status);
    const compiledArtifact = compileMissionCycleInputV1(definition, observation, step, {
      definitionRevision: definition.definitionRevision, validationRevision: provenance.value.validationRevision!, proofreadAcceptanceDigest: provenance.value.proofreadAcceptanceDigest!,
    });
    const { compiledArtifactId: _compiledArtifactId, ...cycleInput } = compiledArtifact;
    const identity = deriveMissionCycleIdentityV1(cycleInput);
    const runtimeBinding = observation.runtimeBindings.find((item) => item.seatId === step.seatId);
    if (observation.permissionContext.decisionId !== identity.decisionId || runtimeBinding?.runtimeHostObserved.kind !== "runtime.host_observed"
      || runtimeBinding.runtimeHostObserved.runtimeId !== observation.permissionContext.reasoningRuntimeId || runtimeBinding.executorHostObserved.kind !== "executor.host_observed"
      || runtimeBinding.executorHostObserved.executorId !== observation.permissionContext.toolExecutorId) return blocked("observation_mismatch", status);
    const runnerPlan: RunnerCyclePlan = { runnerContractVersion: 1, cycleId: identity.cycleId, missionId: definition.missionId, subjectId: definition.subjectId,
      revisionId: cycleInput.expectedRevisionId, evaluatedThroughSequence: observation.permissionContext.evaluatedThroughSequence, seatId: step.seatId,
      activatedModes: cycleInput.activatedModes, actionId: step.actionId, effectClass: step.effectClass, effectKey: identity.effectKey,
      validationId: step.validationId, stopCondition: "after_one_cycle" };
    let requiredCapabilities: readonly string[];
    let permissionEvaluation: ReturnType<typeof evaluatePermission>;
    try {
      requiredCapabilities = dependencies.missionCycle.requiredCapabilities(runnerPlan);
      permissionEvaluation = evaluatePermission(runnerPlan, observation.permissionContext);
    } catch { return blocked("observation_mismatch", status); }
    if (canonicalJson(requiredCapabilities) !== canonicalJson(step.requiredCapabilities)
      || canonicalJson(observation.permissionContext.requiredCapabilities) !== canonicalJson(step.requiredCapabilities)
      || permissionEvaluation.outcome !== "allow") return blocked("observation_mismatch", status);
    const runnerResult = await runMissionCycle(cycleInput, { ...dependencies.missionCycle, getPermissionContext: () => observation.permissionContext });
    if (runnerResult.outcome !== "advanced" && runnerResult.outcome !== "complete") return { ...blocked(runnerResult.outcome === "uncertain" ? "uncertain_execution" : "runner_blocked", status, runnerResult.outcome === "uncertain" ? "uncertain" : runnerResult.outcome === "waiting" ? "waiting" : "blocked"), dispatchEffects: runnerDispatchEffects(runnerResult), runnerResult };
    const edge = outgoing.find((item) => item.condition === "success"); if (!edge) return blocked("definition_invalid", status);
    const evidenceRef = "effectKey" in runnerResult ? runnerResult.effectKey : identity.effectKey;
    const receipt = makeStepReceipt({ sequence: receiptReplay.receipts.length, missionId: definition.missionId, definitionRevision: definition.definitionRevision, graphRevision: definition.graph.graphRevision,
      stepId: step.stepId, attempt, fromNodeId: node.nodeId, toNodeId: edge.toNodeId, edgeId: edge.edgeId, outcome: "success", evidenceRefs: [evidenceRef], runnerBinding: runtimeBinding, previousReceiptDigest });
    const appended = await appendStepReceipt(receipt, receiptReplay.receipts, dependencies.stepReceiptStore);
    if (appended !== "appended") return { ...blocked(appended === "uncertain" ? "uncertain_execution" : "readback_mismatch", status, appended === "uncertain" ? "uncertain" : "blocked"), dispatchEffects: runnerDispatchEffects(runnerResult), runnerResult };
    return { outcome: "advanced", reasonCode: "complete", dispatchEffects: runnerResult.outcome === "advanced" ? 1 : 0, receipt, runnerResult, mackEvaluation: null, status: projectMissionStatusV1(definition, [...observation.stepReceipts, receipt]) };
  }
  const mack = await runMackAdapter(definition, observation, step, attempt, dependencies.mack);
  if (mack.state === "blocked" || mack.state === "uncertain") return { ...blocked(mack.state === "uncertain" ? "uncertain_execution" : mack.reasonCode ?? "mack_blocked", status, mack.state), dispatchEffects: mack.dispatchEffects, mackEvaluation: mack.evaluation };
  const condition = mack.state === "success" ? "success" : "repair";
  const edge = outgoing.find((item) => item.condition === condition && (receiptReplay.edgeCounts.get(item.edgeId) ?? 0) < item.maximumTraversals);
  if (!edge) {
    const exhaustionEdge = outgoing.find((item) => item.condition === "repair");
    if (!exhaustionEdge || !mack.reportRef) return { ...blocked("repair_exhausted", status), dispatchEffects: mack.dispatchEffects, mackEvaluation: mack.evaluation };
    const exhaustionReceipt = makeStepReceipt({ sequence: receiptReplay.receipts.length, missionId: definition.missionId, definitionRevision: definition.definitionRevision, graphRevision: definition.graph.graphRevision,
      stepId: step.stepId, attempt, fromNodeId: node.nodeId, toNodeId: node.nodeId, edgeId: exhaustionEdge.edgeId, outcome: "repair_exhausted", evidenceRefs: [mack.reportRef], runnerBinding: null, previousReceiptDigest });
    const appended = await appendStepReceipt(exhaustionReceipt, receiptReplay.receipts, dependencies.stepReceiptStore);
    if (appended !== "appended") return { ...blocked(appended === "uncertain" ? "uncertain_execution" : "readback_mismatch", status, appended === "uncertain" ? "uncertain" : "blocked"), dispatchEffects: mack.dispatchEffects, mackEvaluation: mack.evaluation };
    return { outcome: "blocked", reasonCode: "repair_exhausted", dispatchEffects: mack.dispatchEffects, receipt: exhaustionReceipt, runnerResult: null, mackEvaluation: mack.evaluation,
      status: projectMissionStatusV1(definition, [...observation.stepReceipts, exhaustionReceipt]) };
  }
  const receipt = makeStepReceipt({ sequence: receiptReplay.receipts.length, missionId: definition.missionId, definitionRevision: definition.definitionRevision, graphRevision: definition.graph.graphRevision,
    stepId: step.stepId, attempt, fromNodeId: node.nodeId, toNodeId: edge.toNodeId, edgeId: edge.edgeId, outcome: condition, evidenceRefs: mack.reportRef ? [mack.reportRef] : [], runnerBinding: null, previousReceiptDigest });
  const appended = await appendStepReceipt(receipt, receiptReplay.receipts, dependencies.stepReceiptStore);
  if (appended !== "appended") return { ...blocked(appended === "uncertain" ? "uncertain_execution" : "readback_mismatch", status, appended === "uncertain" ? "uncertain" : "blocked"), dispatchEffects: mack.dispatchEffects, mackEvaluation: mack.evaluation };
  return { outcome: "advanced", reasonCode: "complete", dispatchEffects: mack.dispatchEffects, receipt, runnerResult: null, mackEvaluation: mack.evaluation, status: projectMissionStatusV1(definition, [...observation.stepReceipts, receipt]) };
}

export function missionBuilderBenchmarkV1(before: unknown, after: unknown): Readonly<{ state: "valid" | "invalid"; deltas: Readonly<Record<"hillTokens" | "handoffs" | "elapsedMilliseconds" | "repeatedContextReads" | "humanInterventions", number>> | null }> {
  const fields = ["hillTokens", "handoffs", "elapsedMilliseconds", "repeatedContextReads", "humanInterventions"] as const;
  if (!exact(before, fields) || !exact(after, fields) || fields.some((field) => !Number.isSafeInteger(before[field]) || !Number.isSafeInteger(after[field]) || (before[field] as number) < 0 || (after[field] as number) < 0)) return { state: "invalid", deltas: null };
  return { state: "valid", deltas: freeze(Object.fromEntries(fields.map((field) => [field, (after[field] as number) - (before[field] as number)])) as Record<typeof fields[number], number>) };
}
