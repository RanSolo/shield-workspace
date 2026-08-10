import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { evaluateMackValidationV0, type MackEvaluationV0, type MackExpectedBindingV0, type MackValidationReportV0 } from "./mack-validation-v0.mjs";
import { type MissionIntakeCandidateV1 } from "./mission-intake-v1.mjs";
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
import { validatePermissionInvocationContext, type PermissionInvocationContext } from "./permission-v1.mjs";
import { replayProfileAwareMissionJournal } from "./profile-aware-mission-v1.mjs";
import { type RunnerEffectClass, type RunnerModeReference } from "./runner-v1.mjs";
import {
  createSeatDispatchLifecycleEventV1,
  createSeatDispatchStartedEventV1,
  replaySeatDispatchReceiptsV1,
  type ExecutorHostObservedV1,
  type ExecutorSelfReportUnavailableV1,
  type RuntimeConfiguredV1,
  type RuntimeHostObservedV1,
  type RuntimeRequestedV1,
  type RuntimeSelfReportUnavailableV1,
  type SeatDispatchReceiptEventV1,
  type SeatDispatchReceiptProjectionV1,
} from "./seat-dispatch-receipt-v1.mjs";
import {
  isDispatchableRoleId,
  isHumanGateRoleId,
  type CanonicalRoleId,
  type DispatchableRoleId,
  type HumanGateRoleId,
} from "./role-taxonomy-v1.mjs";

export const MISSION_BUILDER_SCHEMA_VERSION = 1 as const;
export const MISSION_BUILDER_CONTRACT_VERSION = "mission.builder.v1" as const;
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

export interface MissionEvidenceContractV1 {
  readonly evidenceContractId: string;
  readonly nodeId: string;
  readonly kind: "runner_effect" | "mack_report" | "human_authority";
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
  readonly recordDigest: string;
}

export interface MissionProvenanceProjectionV1 {
  readonly state: "valid";
  readonly records: readonly MissionProvenanceRecordV1[];
  readonly missionId: string;
  readonly definitionRevision: string;
  readonly validationRevision: string | null;
  readonly proofreadAcceptanceDigest: string | null;
  readonly lastRecordDigest: string;
}

export interface MissionProvenanceStoreV1 {
  acquireLock(input: { missionId: string; lockOwnerId: string }): Promise<{ state: "acquired"; lockToken: string } | { state: "blocked"; code: "lock_held" | "store_unavailable" }>;
  append(input: { missionId: string; lockToken: string; expectedPreviousRecordDigest: string | null; record: MissionProvenanceRecordV1 }): Promise<{ state: "appended" } | { state: "blocked"; code: "conflict" | "lock_lost" | "store_unavailable" } | { state: "uncertain"; code: "recovery_required" }>;
  replay(input: { missionId: string }): Promise<unknown>;
  readExact(input: { missionId: string; recordDigest: string }): Promise<unknown>;
  recover(input: { missionId: string; lockOwnerId: string }): Promise<{ state: "recovered" | "blocked"; code?: "store_unavailable" | "manual_recovery_required" }>;
  releaseLock(input: { missionId: string; lockToken: string }): Promise<void>;
}

export type MissionProvenanceAppendResultV1 = Readonly<
  | { state: "recorded"; record: MissionProvenanceRecordV1 }
  | { state: "blocked"; code: "lock_held" | "store_unavailable" | "conflict" | "lock_lost" | "readback_mismatch" }
  | { state: "uncertain"; code: "recovery_required" | "manual_recovery_required" }
>;

export interface MissionCompletedEvidenceV1 {
  readonly evidenceContractId: string;
  readonly nodeId: string;
  readonly artifactRevision: string;
  readonly source: "runner_receipt" | "mack_receipt" | "human_recorded";
}

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
  readonly outcome: "success" | "repair" | "human_evidence";
  readonly evidenceRefs: readonly string[];
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
  readonly runtimeHostObserved: RuntimeHostObservedV1;
  readonly executorHostObserved: ExecutorHostObservedV1;
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
  readonly completedEvidence: readonly MissionCompletedEvidenceV1[];
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

function digest(domain: string, value: unknown): string {
  return `sha256:${createHash("sha256").update(domain).update("\0").update(canonicalJson(value)).digest("base64url")}`;
}

function canonicalModes(modes: readonly RunnerModeReference[]): RunnerModeReference[] {
  return modes.map((mode) => ({ ...mode })).sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
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

function requirementFor(candidate: MissionIntakeCandidateV1, seatId: HumanGateRoleId): string | null {
  return candidate.requirements.find((requirement) => requirement.requiredSeatId === seatId)?.requirementId ?? null;
}

function buildPrompt(pattern: MissionPatternV1, seatId: CanonicalRoleId, objective: string): string {
  if (isHumanGateRoleId(seatId)) return `Wait for recorded ${seatId} evidence for ${objective}. Do not simulate or infer a human decision.`;
  if (seatId === "mack") return `Validate the exact artifact revision for the ${pattern} mission. Return one closed Mack report; do not authorize execution.`;
  return `Perform the single bounded ${pattern} step owned by ${seatId}: ${objective}. Stop after one runner cycle and report evidence.`;
}

function nodeId(pattern: MissionPatternV1, suffix: string): string { return `node:${pattern}:${suffix}`; }
function stepId(pattern: MissionPatternV1, suffix: string): string { return `step:${pattern}:${suffix}`; }
function evidenceId(pattern: MissionPatternV1, suffix: string): string { return `evidence:${pattern}:${suffix}`; }

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
  const candidate = input.candidate as MissionIntakeCandidateV1;
  const pattern = input.pattern as MissionPatternV1;
  const spec = TEMPLATE[pattern];
  if (!plain(candidate) || candidate.state !== "candidate" || candidate.authority !== "non_authoritative" || candidate.persistence !== "not_persisted"
    || !dense(candidate.blockers, 16) || candidate.blockers.length !== 0 || !plain(candidate.brief) || !plain(candidate.repositoryObservation)
    || !participant(candidate, spec.owner) || !participant(candidate, "hill") || !participant(candidate, "coulson") || !participant(candidate, "fitz")) {
    return { state: "blocked", reasonCodes: ["intake_not_eligible"], definition: null, provenanceRecords: [] };
  }
  const modes = canonicalModes(input.activatedModes as RunnerModeReference[]);
  if (!modes.some((mode) => mode.modeId === spec.mode) || modes.some((mode, index) => canonicalJson(mode) === canonicalJson(modes[index - 1]))) {
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
    { evidenceContractId: evidenceId(pattern, "work"), nodeId: nodeId(pattern, "work"), kind: "runner_effect", requiredSeatId: spec.owner, requirementId: null, authority: "non_authoritative" },
    { evidenceContractId: evidenceId(pattern, "mack"), nodeId: nodeId(pattern, "mack"), kind: "mack_report", requiredSeatId: "mack", requirementId: null, authority: "non_authoritative" },
    ...humanSeats.map((seatId): MissionEvidenceContractV1 => ({ evidenceContractId: evidenceId(pattern, seatId), nodeId: nodeId(pattern, seatId), kind: "human_authority", requiredSeatId: seatId, requirementId: requirementFor(candidate, seatId), authority: "human_authority" })),
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
  ] as MissionGraphEdgeV1[]).sort((left, right) => left.edgeId.localeCompare(right.edgeId));
  const graphBase = { startNodeId: nodeId(pattern, "work"), nodes: nodes.sort((left, right) => left.nodeId.localeCompare(right.nodeId)), edges };
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
  const steps: MissionStepManifestV1[] = [
    { stepId: stepId(pattern, "work"), nodeId: nodeId(pattern, "work"), seatId: spec.owner, adapter: "mission_cycle", actionId: spec.action, effectClass: spec.effect, validationId: `validation:${pattern}:work`, promptId: `prompt:${pattern}:${spec.owner}`, handoffId: `handoff:${pattern}:${spec.owner}`, maximumAttempts: 1, requiredCapabilities: [] },
    { stepId: stepId(pattern, "mack"), nodeId: nodeId(pattern, "mack"), seatId: "mack", adapter: "mack_host", actionId: "mission.mack.validate", effectClass: "verification", validationId: `validation:${pattern}:mack`, promptId: `prompt:${pattern}:mack`, handoffId: `handoff:${pattern}:mack`, maximumAttempts: 1 + (input.maximumRepairs as number), requiredCapabilities: [] },
  ];
  const generatedDigest = digest("shield.mission-builder.generated.v1", { pattern, candidateRevision: candidate.issueObservation.issueRevisionId, graph, prompts, handoffs, steps });
  const content: Omit<MissionDefinitionV1, "definitionRevision"> = {
    schemaVersion: 1, contractVersion: MISSION_BUILDER_CONTRACT_VERSION, authority: "non_authoritative", missionId: candidate.brief.missionId,
    subjectId: candidate.brief.subjectId, objective: candidate.brief.objective, pattern, repositoryId: candidate.repositoryObservation.repositoryId,
    repositoryRevision: candidate.repositoryObservation.headRevision, intakeRevisionId: candidate.issueObservation.issueRevisionId,
    templateId: `mission-builder:${pattern}`, templateVersion: 1, participants, activatedModes: modes, prompts, handoffs,
    evidenceContracts, steps, graph, repairPolicy: { maximumRepairs: input.maximumRepairs as number, exhaustedRoute: "hill" },
    escalation: [
      { reason: "ambiguous", route: "hill" }, { reason: "failed", route: "fury" },
      { reason: "uncertain", route: "coulson" }, { reason: "scope_change", route: "coulson" },
    ],
    stopConditions: ["ambiguous_ownership", "failed_validation", "missing_binding", "scope_change", "stale_revision", "uncertain_execution"],
    provenance: { generatedDigest, editedDigest: null, parentDigest: null },
  };
  const definition = freeze({ ...content, definitionRevision: definitionRevision(content) });
  const checked = validateMissionDefinitionV1(definition);
  if (checked.state === "invalid") return { state: "blocked", reasonCodes: checked.reasonCodes, definition: null, provenanceRecords: [] };
  const generated = makeProvenanceRecord({
    sequence: 0, kind: "definition.generated", missionId: definition.missionId, definitionRevision: definition.definitionRevision,
    parentDefinitionRevision: null, repositoryRevision: definition.repositoryRevision, actorSeatId: "hill", templateId: definition.templateId,
    templateVersion: 1, intakeRevisionId: definition.intakeRevisionId, generatedDigest, editedDigest: null, editRecord: [], validationRevision: null,
    proofreadAcceptanceDigest: null, previousRecordDigest: null,
  });
  const validationRevision = digest("shield.mission-validation.v1", { definitionRevision: definition.definitionRevision });
  const validated = makeProvenanceRecord({
    sequence: 1, kind: "definition.validated", missionId: definition.missionId, definitionRevision: definition.definitionRevision,
    parentDefinitionRevision: definition.definitionRevision, repositoryRevision: definition.repositoryRevision, actorSeatId: "may", templateId: definition.templateId,
    templateVersion: 1, intakeRevisionId: definition.intakeRevisionId, generatedDigest, editedDigest: null, editRecord: [], validationRevision,
    proofreadAcceptanceDigest: null, previousRecordDigest: generated.recordDigest,
  });
  return { state: "built", reasonCodes: [], definition, provenanceRecords: [generated, validated] };
}

const DEFINITION_FIELDS = ["schemaVersion", "contractVersion", "authority", "missionId", "subjectId", "objective", "pattern", "repositoryId", "repositoryRevision", "intakeRevisionId", "templateId", "templateVersion", "definitionRevision", "participants", "activatedModes", "prompts", "handoffs", "evidenceContracts", "steps", "graph", "repairPolicy", "escalation", "stopConditions", "provenance"] as const;

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
    if (!exact(evidence, ["evidenceContractId", "nodeId", "kind", "requiredSeatId", "requirementId", "authority"]) || !ID.test(String(evidence.evidenceContractId)) || evidenceIds.has(String(evidence.evidenceContractId)) || !nodeIds.has(String(evidence.nodeId))) reasons.push("evidence_contract_invalid");
    evidenceIds.add(String(evidence.evidenceContractId));
    if (evidence.requirementId !== null && !ID.test(String(evidence.requirementId))) reasons.push("evidence_requirement_invalid");
    if (evidence.kind === "human_authority" ? !isHumanGateRoleId(evidence.requiredSeatId) || evidence.authority !== "human_authority" : !isDispatchableRoleId(evidence.requiredSeatId) || evidence.authority !== "non_authoritative") reasons.push("evidence_authority_invalid");
  }
  for (const handoff of value.handoffs ?? []) {
    if (!exact(handoff, ["handoffId", "fromSeatId", "toSeatId", "missionId", "subjectId", "repositoryRevision", "promptId", "evidenceContractIds", "source", "content", "contentDigest"])
      || !ID.test(String(handoff.handoffId)) || handoffIds.has(String(handoff.handoffId)) || !isDispatchableRoleId(handoff.fromSeatId) || !participantIds.has(String(handoff.toSeatId))
      || handoff.missionId !== value.missionId || handoff.subjectId !== value.subjectId || handoff.repositoryRevision !== value.repositoryRevision || !promptIds.has(String(handoff.promptId))
      || !dense(handoff.evidenceContractIds, 32) || handoff.evidenceContractIds.some((item) => !evidenceIds.has(String(item))) || !["generated", "hill_edited"].includes(String(handoff.source))
      || typeof handoff.content !== "string" || handoff.content.length === 0 || handoff.content.length > 4096 || handoff.contentDigest !== digest("shield.mission-handoff.v1", handoff.content)) reasons.push("handoff_invalid");
    handoffIds.add(String(handoff.handoffId));
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
  }
  if (runnerSteps !== 1) reasons.push("runner_step_count_invalid");
  for (const edge of value.graph?.edges ?? []) {
    if (!exact(edge, ["edgeId", "fromNodeId", "toNodeId", "condition", "evidenceContractId", "maximumTraversals", "priority"]) || !ID.test(String(edge.edgeId)) || edgeIds.has(String(edge.edgeId))
      || !nodeIds.has(String(edge.fromNodeId)) || !nodeIds.has(String(edge.toNodeId)) || !evidenceIds.has(String(edge.evidenceContractId))
      || !["success", "repair", "human_evidence"].includes(edge.condition) || !Number.isSafeInteger(edge.maximumTraversals) || edge.maximumTraversals < (edge.condition === "repair" ? 0 : 1)
      || edge.maximumTraversals > (edge.condition === "repair" ? MISSION_BUILDER_MAX_REPAIRS : 1) || !Number.isSafeInteger(edge.priority) || edge.priority < 0) reasons.push("edge_invalid");
    edgeIds.add(String(edge.edgeId));
    if (edge.fromNodeId === edge.toNodeId && edge.condition !== "repair") reasons.push("unbounded_cycle");
  }
  const terminals = value.graph?.nodes.filter((node) => node.kind === "terminal") ?? [];
  if (terminals.length === 0 || value.graph?.nodes.some((node) => node.kind !== "terminal" && !value.graph.edges.some((edge) => edge.fromNodeId === node.nodeId && edge.maximumTraversals > 0))) reasons.push("dead_end_node");
  const reachable = new Set<string>([value.graph?.startNodeId]);
  for (let pass = 0; pass < (value.graph?.nodes.length ?? 0); pass += 1) for (const edge of value.graph?.edges ?? []) if (edge.maximumTraversals > 0 && reachable.has(edge.fromNodeId)) reachable.add(edge.toNodeId);
  if ((value.graph?.nodes ?? []).some((node) => !reachable.has(node.nodeId)) || terminals.some((node) => !reachable.has(node.nodeId))) reasons.push("unreachable_node");
  if (canonicalJson(value.graph?.nodes) !== canonicalJson([...(value.graph?.nodes ?? [])].sort((a, b) => a.nodeId.localeCompare(b.nodeId)))
    || canonicalJson(value.graph?.edges) !== canonicalJson([...(value.graph?.edges ?? [])].sort((a, b) => a.edgeId.localeCompare(b.edgeId)))) reasons.push("graph_not_canonical");
  if (value.graph?.graphRevision !== digest("shield.mission-graph.v1", graphWithoutRevision(value.graph))) reasons.push("graph_revision_mismatch");
  if (!exact(value.repairPolicy, ["maximumRepairs", "exhaustedRoute"]) || !Number.isSafeInteger(value.repairPolicy.maximumRepairs) || value.repairPolicy.maximumRepairs < 0 || value.repairPolicy.maximumRepairs > MISSION_BUILDER_MAX_REPAIRS || value.repairPolicy.exhaustedRoute !== "hill"
    || value.graph.edges.filter((edge) => edge.condition === "repair").some((edge) => edge.maximumTraversals !== value.repairPolicy.maximumRepairs)) reasons.push("repair_policy_invalid");
  if (!value.escalation.every((item) => exact(item, ["reason", "route"]) && ["ambiguous", "failed", "uncertain", "scope_change"].includes(String(item.reason)) && ["hill", "fury", "coulson"].includes(String(item.route)))) reasons.push("escalation_invalid");
  if (!value.stopConditions.every((item) => typeof item === "string" && ID.test(item)) || new Set(value.stopConditions).size !== value.stopConditions.length) reasons.push("stop_condition_invalid");
  if (!exact(value.provenance, ["generatedDigest", "editedDigest", "parentDigest"]) || !DIGEST.test(value.provenance.generatedDigest)
    || (value.provenance.editedDigest !== null && !DIGEST.test(value.provenance.editedDigest)) || (value.provenance.parentDigest !== null && !DIGEST.test(value.provenance.parentDigest))
    || (value.provenance.editedDigest === null) !== (value.provenance.parentDigest === null)) reasons.push("definition_provenance_invalid");
  if (value.definitionRevision !== definitionRevision(withoutRevision(value))) reasons.push("definition_revision_mismatch");
  return reasons.length > 0 ? { state: "invalid", value: null, reasonCodes: Object.freeze([...new Set(reasons)].sort()) } : { state: "valid", value: freeze(value), reasonCodes: [] };
}

const PROVENANCE_FIELDS = ["schemaVersion", "contractVersion", "sequence", "recordId", "kind", "missionId", "definitionRevision", "parentDefinitionRevision", "repositoryRevision", "actorSeatId", "templateId", "templateVersion", "intakeRevisionId", "generatedDigest", "editedDigest", "editRecord", "validationRevision", "proofreadAcceptanceDigest", "previousRecordDigest", "recordDigest"] as const;

export function replayMissionProvenanceV1(input: unknown): Readonly<{ state: "valid"; value: MissionProvenanceProjectionV1 } | { state: "invalid"; code: string }> {
  if (!dense(input, 256) || input.length === 0) return { state: "invalid", code: "malformed_provenance" };
  let definition = ""; let validation: string | null = null; let acceptance: string | null = null; let previous: string | null = null; let missionId = "";
  for (let index = 0; index < input.length; index += 1) {
    const record = input[index] as MissionProvenanceRecordV1;
    if (!exact(record, PROVENANCE_FIELDS) || record.schemaVersion !== 1 || record.contractVersion !== "mission.provenance.v1" || record.sequence !== index
      || record.recordId !== `provenance:${record.missionId}:${index}` || record.previousRecordDigest !== previous || !DIGEST.test(record.recordDigest)
      || record.recordDigest !== digest("shield.mission-provenance.v1", (({ recordDigest: _ignored, ...rest }) => rest)(record)) || !dense(record.editRecord, 64)
      || !["definition.generated", "definition.edited", "definition.validated", "proofreading.accepted"].includes(record.kind) || !ID.test(record.missionId) || !DIGEST.test(record.definitionRevision)
      || (record.parentDefinitionRevision !== null && !DIGEST.test(record.parentDefinitionRevision)) || !REVISION.test(record.repositoryRevision) || !["hill", "may"].includes(record.actorSeatId)
      || !ID.test(record.templateId) || record.templateVersion !== 1 || !ID.test(record.intakeRevisionId) || !DIGEST.test(record.generatedDigest)
      || (record.editedDigest !== null && !DIGEST.test(record.editedDigest)) || (record.validationRevision !== null && !DIGEST.test(record.validationRevision))
      || (record.proofreadAcceptanceDigest !== null && !DIGEST.test(record.proofreadAcceptanceDigest)) || !record.editRecord.every((edit) => exact(edit, ["target", "targetId", "replacementDigest"])
        && ["prompt", "handoff"].includes(String(edit.target)) && ID.test(String(edit.targetId)) && DIGEST.test(String(edit.replacementDigest)))) return { state: "invalid", code: "provenance_conflict" };
    if (index === 0) {
      if (record.kind !== "definition.generated" || record.parentDefinitionRevision !== null) return { state: "invalid", code: "generated_record_missing" };
      missionId = record.missionId; definition = record.definitionRevision;
    } else if (record.missionId !== missionId) return { state: "invalid", code: "mixed_scope" };
    if (record.kind === "definition.edited") {
      if (record.actorSeatId !== "hill" || record.parentDefinitionRevision !== definition || record.editedDigest === null || record.editRecord.length === 0 || record.validationRevision !== null || record.proofreadAcceptanceDigest !== null) return { state: "invalid", code: "edit_record_invalid" };
      definition = record.definitionRevision; validation = null; acceptance = null;
    }
    if (record.definitionRevision !== definition) return { state: "invalid", code: "stale_definition" };
    if (record.kind === "definition.validated") {
      const expectedValidation = digest("shield.mission-validation.v1", { definitionRevision: record.definitionRevision });
      if (record.actorSeatId !== "may" || record.validationRevision !== expectedValidation || record.proofreadAcceptanceDigest !== null || record.editRecord.length !== 0) return { state: "invalid", code: "validation_missing" };
      validation = record.validationRevision; acceptance = null;
    }
    if (record.kind === "proofreading.accepted") {
      const expectedAcceptance = validation === null ? null : digest("shield.mission-proofreading.v1", { definitionRevision: record.definitionRevision, validationRevision: validation, actorSeatId: "hill" });
      if (validation === null || record.validationRevision !== validation || record.actorSeatId !== "hill" || record.proofreadAcceptanceDigest !== expectedAcceptance || record.editRecord.length !== 0) return { state: "invalid", code: "proofreading_stale" };
      acceptance = record.proofreadAcceptanceDigest;
    }
    previous = record.recordDigest;
  }
  return { state: "valid", value: freeze({ state: "valid", records: [...input] as MissionProvenanceRecordV1[], missionId, definitionRevision: definition, validationRevision: validation, proofreadAcceptanceDigest: acceptance, lastRecordDigest: previous! }) };
}

export async function appendMissionProvenanceRecordV1(
  store: MissionProvenanceStoreV1,
  record: MissionProvenanceRecordV1,
  lockOwnerId: string,
): Promise<MissionProvenanceAppendResultV1> {
  if (!ID.test(lockOwnerId) || !exact(record, PROVENANCE_FIELDS)) return { state: "blocked", code: "conflict" };
  const acquired = await store.acquireLock({ missionId: record.missionId, lockOwnerId });
  if (acquired.state !== "acquired") return { state: "blocked", code: acquired.code };
  try {
    const appended = await store.append({ missionId: record.missionId, lockToken: acquired.lockToken, expectedPreviousRecordDigest: record.previousRecordDigest, record });
    if (appended.state === "blocked") return { state: "blocked", code: appended.code };
    if (appended.state === "uncertain") {
      const recovered = await store.recover({ missionId: record.missionId, lockOwnerId });
      if (recovered.state === "recovered") return { state: "uncertain", code: "recovery_required" };
      return recovered.code === "store_unavailable" ? { state: "blocked", code: "store_unavailable" } : { state: "uncertain", code: "manual_recovery_required" };
    }
    const exactRecord = await store.readExact({ missionId: record.missionId, recordDigest: record.recordDigest });
    if (canonicalJson(exactRecord) !== canonicalJson(record)) return { state: "blocked", code: "readback_mismatch" };
    const replay = replayMissionProvenanceV1(await store.replay({ missionId: record.missionId }));
    if (replay.state === "invalid" || !replay.value.records.some((item) => item.recordDigest === record.recordDigest)) return { state: "blocked", code: "readback_mismatch" };
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
  if (replay.state === "invalid" || replay.value.definitionRevision !== definition.definitionRevision || replay.value.validationRevision === null) return null;
  const acceptance = digest("shield.mission-proofreading.v1", { definitionRevision: definition.definitionRevision, validationRevision: replay.value.validationRevision, actorSeatId: "hill" });
  return makeProvenanceRecord({
    sequence: replay.value.records.length, kind: "proofreading.accepted", missionId: definition.missionId, definitionRevision: definition.definitionRevision,
    parentDefinitionRevision: definition.definitionRevision, repositoryRevision: definition.repositoryRevision, actorSeatId: "hill", templateId: definition.templateId,
    templateVersion: 1, intakeRevisionId: definition.intakeRevisionId, generatedDigest: definition.provenance.generatedDigest, editedDigest: definition.provenance.editedDigest,
    editRecord: [], validationRevision: replay.value.validationRevision, proofreadAcceptanceDigest: acceptance, previousRecordDigest: replay.value.lastRecordDigest,
  });
}

export function editMissionDefinitionTextV1(input: unknown): Readonly<{ state: "edited" | "blocked"; definition: MissionDefinitionV1 | null; record: MissionProvenanceRecordV1 | null }> {
  if (!exact(input, ["definition", "provenanceRecords", "edits"]) || !dense(input.edits, 64)) return { state: "blocked", definition: null, record: null };
  const checked = validateMissionDefinitionV1(input.definition); const replay = replayMissionProvenanceV1(input.provenanceRecords);
  if (checked.state === "invalid" || replay.state === "invalid" || replay.value.definitionRevision !== checked.value.definitionRevision) return { state: "blocked", definition: null, record: null };
  const edits: { target: "prompt" | "handoff"; targetId: string; replacement: string }[] = [];
  for (const item of input.edits) {
    if (!exact(item, ["target", "targetId", "replacement"]) || !["prompt", "handoff"].includes(String(item.target)) || !ID.test(String(item.targetId)) || typeof item.replacement !== "string" || item.replacement.length === 0 || item.replacement.length > 4096) return { state: "blocked", definition: null, record: null };
    edits.push(item as typeof edits[number]);
  }
  edits.sort((a, b) => `${a.target}:${a.targetId}`.localeCompare(`${b.target}:${b.targetId}`));
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
    parentDefinitionRevision: checked.value.definitionRevision, repositoryRevision: definition.repositoryRevision, actorSeatId: "hill", templateId: definition.templateId,
    templateVersion: 1, intakeRevisionId: definition.intakeRevisionId, generatedDigest: definition.provenance.generatedDigest, editedDigest, editRecord: normalized,
    validationRevision: null, proofreadAcceptanceDigest: null, previousRecordDigest: replay.value.lastRecordDigest,
  });
  return { state: "edited", definition, record };
}

export function createMissionValidationRecordV1(input: unknown): MissionProvenanceRecordV1 | null {
  if (!exact(input, ["definition", "provenanceRecords"])) return null;
  const checked = validateMissionDefinitionV1(input.definition); const replay = replayMissionProvenanceV1(input.provenanceRecords);
  if (checked.state === "invalid" || replay.state === "invalid" || replay.value.definitionRevision !== checked.value.definitionRevision) return null;
  const validationRevision = digest("shield.mission-validation.v1", { definitionRevision: checked.value.definitionRevision });
  return makeProvenanceRecord({
    sequence: replay.value.records.length, kind: "definition.validated", missionId: checked.value.missionId, definitionRevision: checked.value.definitionRevision,
    parentDefinitionRevision: checked.value.definitionRevision, repositoryRevision: checked.value.repositoryRevision, actorSeatId: "may", templateId: checked.value.templateId,
    templateVersion: 1, intakeRevisionId: checked.value.intakeRevisionId, generatedDigest: checked.value.provenance.generatedDigest, editedDigest: checked.value.provenance.editedDigest,
    editRecord: [], validationRevision, proofreadAcceptanceDigest: null, previousRecordDigest: replay.value.lastRecordDigest,
  });
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

function replayStepReceipts(definition: MissionDefinitionV1, input: unknown): { state: "valid"; currentNodeId: string; receipts: readonly MissionStepReceiptV1[]; edgeCounts: Map<string, number>; evidence: string[] } | { state: "invalid" } {
  if (!dense(input, 256)) return { state: "invalid" };
  let current = definition.graph.startNodeId; let previous: string | null = null; const edgeCounts = new Map<string, number>(); const evidence: string[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const receipt = input[index] as MissionStepReceiptV1;
    const fields = ["schemaVersion", "contractVersion", "sequence", "receiptId", "missionId", "definitionRevision", "graphRevision", "stepId", "attempt", "fromNodeId", "toNodeId", "edgeId", "outcome", "evidenceRefs", "previousReceiptDigest", "receiptDigest"];
    if (!exact(receipt, fields) || receipt.sequence !== index || receipt.missionId !== definition.missionId || receipt.definitionRevision !== definition.definitionRevision || receipt.graphRevision !== definition.graph.graphRevision
      || receipt.fromNodeId !== current || receipt.previousReceiptDigest !== previous || !dense(receipt.evidenceRefs, 32) || receipt.receiptDigest !== stepReceiptDigest((({ receiptDigest: _ignored, ...rest }) => rest)(receipt))
      || receipt.receiptId !== deriveMissionStepIdentityV1(receipt.graphRevision, receipt.stepId, receipt.attempt)) return { state: "invalid" };
    const edge = definition.graph.edges.find((item) => item.edgeId === receipt.edgeId);
    const node = definition.graph.nodes.find((item) => item.nodeId === current);
    if (!edge || !node || edge.fromNodeId !== current || edge.toNodeId !== receipt.toNodeId || (node.stepId ?? `human:${node.nodeId}`) !== receipt.stepId) return { state: "invalid" };
    const count = (edgeCounts.get(edge.edgeId) ?? 0) + 1;
    if (count > edge.maximumTraversals || receipt.outcome !== edge.condition) return { state: "invalid" };
    edgeCounts.set(edge.edgeId, count); current = receipt.toNodeId; previous = receipt.receiptDigest; evidence.push(...receipt.evidenceRefs);
  }
  return { state: "valid", currentNodeId: current, receipts: input as MissionStepReceiptV1[], edgeCounts, evidence };
}

export function projectMissionStatusV1(definitionInput: unknown, receiptsInput: unknown, completedEvidenceInput: unknown = []): MissionStatusProjectionV1 | null {
  const checked = validateMissionDefinitionV1(definitionInput);
  if (checked.state === "invalid" || !dense(completedEvidenceInput, 256)) return null;
  const replay = replayStepReceipts(checked.value, receiptsInput);
  if (replay.state === "invalid") return freeze({ schemaVersion: 1, contractVersion: "mission.status.v1", missionId: checked.value.missionId, definitionRevision: checked.value.definitionRevision, currentState: "blocked", currentNodeId: checked.value.graph.startNodeId, activeSeatId: null, completedEvidence: [], nextTransition: null, stopReason: "invalid_replay" });
  const node = checked.value.graph.nodes.find((item) => item.nodeId === replay.currentNodeId)!;
  const outgoing = checked.value.graph.edges.filter((edge) => edge.fromNodeId === node.nodeId && (replay.edgeCounts.get(edge.edgeId) ?? 0) < edge.maximumTraversals).sort((a, b) => a.priority - b.priority || a.edgeId.localeCompare(b.edgeId));
  const completed = [...new Set([...replay.evidence, ...(completedEvidenceInput as MissionCompletedEvidenceV1[]).map((item) => item.evidenceContractId)])].sort();
  return freeze({
    schemaVersion: 1, contractVersion: "mission.status.v1", missionId: checked.value.missionId, definitionRevision: checked.value.definitionRevision,
    currentState: node.kind === "terminal" ? "complete" : node.kind === "human_gate" ? "waiting" : "ready", currentNodeId: node.nodeId,
    activeSeatId: node.seatId, completedEvidence: completed, nextTransition: outgoing[0]?.edgeId ?? null,
    stopReason: node.kind === "terminal" ? "terminal" : node.kind === "human_gate" ? "human_gate" : outgoing.length === 0 ? "repair_exhausted" : null,
  });
}

function blocked(reasonCode: MissionAdvanceReasonV1, status: MissionStatusProjectionV1 | null = null, outcome: "blocked" | "waiting" | "uncertain" = "blocked"): MissionAdvanceResultV1 {
  return { outcome, reasonCode, dispatchEffects: 0, receipt: null, runnerResult: null, mackEvaluation: null, status };
}

function validEvidence(value: unknown): value is MissionCompletedEvidenceV1 {
  return exact(value, ["evidenceContractId", "nodeId", "artifactRevision", "source"]) && ID.test(String(value.evidenceContractId)) && ID.test(String(value.nodeId)) && REVISION.test(String(value.artifactRevision)) && ["runner_receipt", "mack_receipt", "human_recorded"].includes(String(value.source));
}

function validRuntime(value: unknown): value is MissionHostRuntimeObservationV1 {
  return exact(value, ["seatId", "configuredRuntime", "requestedRuntime", "runtimeHostObserved", "executorHostObserved"]) && isDispatchableRoleId(value.seatId)
    && plain(value.configuredRuntime) && value.configuredRuntime.kind === "runtime.configured" && ID.test(String(value.configuredRuntime.runtimeId)) && ID.test(String(value.configuredRuntime.model))
    && plain(value.requestedRuntime) && value.requestedRuntime.kind === "runtime.requested" && ID.test(String(value.requestedRuntime.runtimeId)) && ID.test(String(value.requestedRuntime.model))
    && plain(value.runtimeHostObserved) && value.runtimeHostObserved.kind === "runtime.host_observed" && ID.test(String(value.runtimeHostObserved.runtimeId)) && ID.test(String(value.runtimeHostObserved.model)) && dense(value.runtimeHostObserved.evidenceRefs, 16)
    && plain(value.executorHostObserved) && value.executorHostObserved.kind === "executor.host_observed" && ID.test(String(value.executorHostObserved.executorId)) && dense(value.executorHostObserved.evidenceRefs, 16);
}

function validateObservation(definition: MissionDefinitionV1, value: unknown): MissionAdvanceHostObservationV1 | null {
  const fields = ["schemaVersion", "contractVersion", "assuranceKind", "repositoryRoot", "repositoryId", "repositoryRevision", "configuredJournalPath", "journalSnapshot", "workspaceId", "sessionId", "activatedModes", "actionAllowlist", "permissionContext", "runtimeBindings", "completedEvidence", "provenanceRecords", "stepReceipts", "dispatchReceiptEntries"];
  if (!exact(value, fields) || value.schemaVersion !== 1 || value.contractVersion !== "mission.advance.host-observation.v1" || value.assuranceKind !== "host_asserted"
    || typeof value.repositoryRoot !== "string" || value.repositoryRoot.length === 0 || value.repositoryId !== definition.repositoryId || value.repositoryRevision !== definition.repositoryRevision
    || typeof value.configuredJournalPath !== "string" || value.configuredJournalPath.length === 0 || !ID.test(String(value.workspaceId)) || !ID.test(String(value.sessionId))
    || !dense(value.activatedModes, 16) || !value.activatedModes.every(validMode) || canonicalJson(canonicalModes(value.activatedModes)) !== canonicalJson(definition.activatedModes)
    || !dense(value.actionAllowlist, 64) || !value.actionAllowlist.every((item) => typeof item === "string" && ID.test(item)) || !dense(value.runtimeBindings, 16) || !value.runtimeBindings.every(validRuntime)
    || !dense(value.completedEvidence, 256) || !value.completedEvidence.every(validEvidence) || !dense(value.provenanceRecords, 256) || !dense(value.stepReceipts, 256) || !dense(value.dispatchReceiptEntries, 512)) return null;
  if (!exact(value.journalSnapshot, ["entries", "projection", "journalDigest"]) || !dense(value.journalSnapshot.entries, 4096) || typeof value.journalSnapshot.journalDigest !== "string") return null;
  const replay = replayProfileAwareMissionJournal(value.journalSnapshot.entries);
  const journalDigest = `sha256:${createHash("sha256").update(canonicalJson(value.journalSnapshot.entries)).digest("base64url")}`;
  if (replay.state === "invalid" || journalDigest !== value.journalSnapshot.journalDigest || canonicalJson(replay.value) !== canonicalJson(value.journalSnapshot.projection)
    || replay.value.missionId !== definition.missionId || replay.value.brief.subjectId !== definition.subjectId || replay.value.brief.revisionId !== (value.permissionContext as PermissionInvocationContext)?.missionRevisionId) return null;
  const permission = validatePermissionInvocationContext(value.permissionContext);
  if (permission.state === "invalid" || permission.value.repositoryId !== definition.repositoryId || permission.value.canonicalWritableRoot !== value.repositoryRoot
    || permission.value.artifactRevisionId !== definition.repositoryRevision || permission.value.evaluatedThroughSequence !== replay.value.lastSequence) return null;
  const dispatchReplay = replaySeatDispatchReceiptsV1(value.dispatchReceiptEntries);
  if (dispatchReplay.state === "invalid" || dispatchReplay.projections.some((receipt) => receipt.parentMissionId !== definition.missionId
    || receipt.parentMissionRevision !== definition.definitionRevision || receipt.parentSessionId !== value.sessionId || receipt.repositoryId !== definition.repositoryId
    || receipt.repositoryWorkspaceId !== value.workspaceId || receipt.repositoryRevision !== definition.repositoryRevision || receipt.subjectId !== definition.subjectId)) return null;
  return value as unknown as MissionAdvanceHostObservationV1;
}

function nextLogState(entries: readonly SeatDispatchReceiptEventV1[]): { logSequence: number; previousLogDigest: string | null } {
  const last = entries[entries.length - 1]; return { logSequence: last ? last.logSequence + 1 : 0, previousLogDigest: last?.entryDigest ?? null };
}

async function runMackAdapter(definition: MissionDefinitionV1, observation: MissionAdvanceHostObservationV1, step: MissionStepManifestV1, attempt: number, dependencies: MackHostDispatchDependenciesV1): Promise<{ state: "success" | "repair" | "blocked" | "uncertain"; evaluation: MackEvaluationV0 | null; reportRef: string | null; dispatchEffects: 0 | 1 }> {
  const handoff = definition.handoffs.find((item) => item.handoffId === step.handoffId)!;
  const runtime = observation.runtimeBindings.find((item) => item.seatId === "mack");
  if (!runtime) return { state: "blocked", evaluation: null, reportRef: null, dispatchEffects: 0 };
  const short = digest("shield.mack-dispatch.v1", { graphRevision: definition.graph.graphRevision, stepId: step.stepId, attempt }).slice(7);
  const receiptId = `receipt:${short}`; const dispatchId = `dispatch:${short}`; const childTaskId = `task:${short}`; const childSessionId = `session:${short}`;
  const subjectRevision = digest("shield.mission-intake-revision.v1", definition.intakeRevisionId);
  let replay = replaySeatDispatchReceiptsV1(observation.dispatchReceiptEntries);
  if (replay.state === "invalid") return { state: "blocked", evaluation: null, reportRef: null, dispatchEffects: 0 };
  let projection = replay.projections.find((item) => item.receiptId === receiptId);
  if (replay.projections.filter((item) => item.receiptId === receiptId || item.dispatchId === dispatchId).length > (projection ? 1 : 0)) return { state: "blocked", evaluation: null, reportRef: null, dispatchEffects: 0 };
  const expectedIdentity = (item: SeatDispatchReceiptProjectionV1): boolean => item.dispatchId === dispatchId && item.parentMissionId === definition.missionId && item.parentMissionRevision === definition.definitionRevision
    && item.parentSessionId === observation.sessionId && item.childTaskId === childTaskId && item.childSessionId === childSessionId && item.accountableSeatId === "mack"
    && item.repositoryId === definition.repositoryId && item.repositoryWorkspaceId === observation.workspaceId && item.repositoryRevision === definition.repositoryRevision
    && item.subjectId === definition.subjectId && item.subjectRevision === subjectRevision && item.artifactId === handoff.handoffId && item.artifactRevision === handoff.contentDigest;
  if (projection && !expectedIdentity(projection)) return { state: "blocked", evaluation: null, reportRef: null, dispatchEffects: 0 };
  const expected: MackExpectedBindingV0 = { missionId: definition.missionId, subjectId: definition.subjectId, repository: definition.repositoryId, branch: observation.permissionContext.branch, artifactRevisionId: definition.repositoryRevision, approvedTestSurfaces: [] };
  if (projection?.state === "completed") {
    const reportRef = projection.outputEvidenceRefs?.[0]; if (!reportRef) return { state: "blocked", evaluation: null, reportRef: null, dispatchEffects: 0 };
    const report = await dependencies.readReport(reportRef);
    if (reportRef !== `mack-report:${digest("shield.mack-report.v1", report).slice(7)}`) return { state: "blocked", evaluation: null, reportRef: null, dispatchEffects: 0 };
    const evaluation = evaluateMackValidationV0(report, expected);
    if (evaluation.state === "invalid") return { state: "blocked", evaluation, reportRef, dispatchEffects: 0 };
    return { state: evaluation.advancementEligibility === "eligible" ? "success" : "repair", evaluation, reportRef, dispatchEffects: 0 };
  }
  if (projection) return { state: "uncertain", evaluation: null, reportRef: null, dispatchEffects: 0 };
  const selfRuntime: RuntimeSelfReportUnavailableV1 = { kind: "runtime.self_report.unavailable", reason: "not_reported" };
  const selfExecutor: ExecutorSelfReportUnavailableV1 = { kind: "executor.self_report.unavailable", reason: "not_reported" };
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
  const appended = await dependencies.appendReceipt(started);
  if (appended.state === "uncertain") return { state: "uncertain", evaluation: null, reportRef: null, dispatchEffects: 0 };
  if (appended.state !== "appended") return { state: "blocked", evaluation: null, reportRef: null, dispatchEffects: 0 };
  replay = replaySeatDispatchReceiptsV1(await dependencies.readReceipts());
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
  const terminalAppend = await dependencies.appendReceipt(completed);
  if (terminalAppend.state !== "appended") return { state: "uncertain", evaluation, reportRef: dispatched.reportRef, dispatchEffects: 1 };
  const readback = replaySeatDispatchReceiptsV1(await dependencies.readReceipts());
  const completedProjection = readback.state === "valid" ? readback.projections.find((item) => item.receiptId === receiptId) : undefined;
  if (!completedProjection || completedProjection.state !== "completed" || !expectedIdentity(completedProjection) || completedProjection.outputEvidenceRefs?.[0] !== dispatched.reportRef) return { state: "uncertain", evaluation, reportRef: dispatched.reportRef, dispatchEffects: 1 };
  return { state: evaluation.advancementEligibility === "eligible" ? "success" : "repair", evaluation, reportRef: dispatched.reportRef, dispatchEffects: 1 };
}

async function appendStepReceipt(receipt: MissionStepReceiptV1, store: MissionStepReceiptStoreV1): Promise<"appended" | "blocked" | "uncertain"> {
  const result = await store.append({ receipt, expectedPreviousReceiptDigest: receipt.previousReceiptDigest });
  if (result.state !== "appended") return result.state;
  const readback = await store.read();
  if (!dense(readback, 256)) return "uncertain";
  const exactReceipt = readback.find((item) => plain(item) && item.receiptId === receipt.receiptId);
  return canonicalJson(exactReceipt) === canonicalJson(receipt) ? "appended" : "uncertain";
}

export function compileMissionCycleInputV1(definition: MissionDefinitionV1, observation: MissionAdvanceHostObservationV1, step: MissionStepManifestV1): MissionCycleInputV1 {
  if (step.adapter !== "mission_cycle" || step.seatId === "mack" || !definition.steps.some((item) => item.stepId === step.stepId)) throw new Error("step is not a runner-backed manifest");
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
    activatedModes: definition.activatedModes.map((mode) => ({ ...mode })),
    actionAllowlist: [...observation.actionAllowlist],
  });
}

export async function advanceMissionV1(input: unknown, dependencies: MissionAdvanceDependenciesV1): Promise<MissionAdvanceResultV1> {
  if (!exact(input, ["schemaVersion", "contractVersion", "definition", "observation"]) || input.schemaVersion !== 1 || input.contractVersion !== "mission.advance.v1") return blocked("input_invalid");
  const checked = validateMissionDefinitionV1(input.definition); if (checked.state === "invalid") return blocked("definition_invalid");
  const definition = checked.value; const observation = validateObservation(definition, input.observation); if (!observation) return blocked("observation_mismatch");
  const provenance = replayMissionProvenanceV1(observation.provenanceRecords);
  if (provenance.state === "invalid" || provenance.value.definitionRevision !== definition.definitionRevision) return blocked("provenance_stale");
  if (provenance.value.validationRevision === null || provenance.value.proofreadAcceptanceDigest === null) return blocked("proofreading_required");
  const receiptReplay = replayStepReceipts(definition, observation.stepReceipts); if (receiptReplay.state === "invalid") return blocked("receipt_invalid");
  const status = projectMissionStatusV1(definition, observation.stepReceipts, observation.completedEvidence);
  const node = definition.graph.nodes.find((item) => item.nodeId === receiptReplay.currentNodeId)!;
  if (node.kind === "terminal") return { outcome: "complete", reasonCode: "complete", dispatchEffects: 0, receipt: null, runnerResult: null, mackEvaluation: null, status };
  const outgoing = definition.graph.edges.filter((edge) => edge.fromNodeId === node.nodeId).sort((a, b) => a.priority - b.priority || a.edgeId.localeCompare(b.edgeId));
  const previousReceiptDigest = receiptReplay.receipts.at(-1)?.receiptDigest ?? null;
  if (node.kind === "human_gate") {
    const edge = outgoing.find((item) => item.condition === "human_evidence");
    const evidence = edge && observation.completedEvidence.find((item) => item.evidenceContractId === edge.evidenceContractId && item.nodeId === node.nodeId && item.source === "human_recorded");
    if (!edge || !evidence) return blocked("human_evidence_required", status, "waiting");
    const receipt = makeStepReceipt({ sequence: receiptReplay.receipts.length, missionId: definition.missionId, definitionRevision: definition.definitionRevision, graphRevision: definition.graph.graphRevision,
      stepId: `human:${node.nodeId}`, attempt: 1, fromNodeId: node.nodeId, toNodeId: edge.toNodeId, edgeId: edge.edgeId, outcome: "human_evidence", evidenceRefs: [evidence.artifactRevision], previousReceiptDigest });
    const appended = await appendStepReceipt(receipt, dependencies.stepReceiptStore);
    if (appended !== "appended") return blocked(appended === "uncertain" ? "uncertain_execution" : "readback_mismatch", status, appended === "uncertain" ? "uncertain" : "blocked");
    return { outcome: "advanced", reasonCode: "complete", dispatchEffects: 0, receipt, runnerResult: null, mackEvaluation: null, status: projectMissionStatusV1(definition, [...observation.stepReceipts, receipt], observation.completedEvidence) };
  }
  const step = definition.steps.find((item) => item.stepId === node.stepId)!;
  const priorAttempts = receiptReplay.receipts.filter((receipt) => receipt.stepId === step.stepId).length;
  const attempt = priorAttempts + 1;
  if (attempt > step.maximumAttempts) return blocked("repair_exhausted", status);
  if (step.adapter === "mission_cycle") {
    if (!observation.actionAllowlist.includes(step.actionId)) return blocked("observation_mismatch", status);
    const cycleInput = compileMissionCycleInputV1(definition, observation, step);
    const identity = deriveMissionCycleIdentityV1(cycleInput);
    if (observation.permissionContext.decisionId !== identity.decisionId || observation.permissionContext.reasoningRuntimeId !== observation.runtimeBindings.find((item) => item.seatId === step.seatId)?.runtimeHostObserved.runtimeId
      || observation.permissionContext.toolExecutorId !== observation.runtimeBindings.find((item) => item.seatId === step.seatId)?.executorHostObserved.executorId) return blocked("observation_mismatch", status);
    const runnerResult = await runMissionCycle(cycleInput, { ...dependencies.missionCycle, getPermissionContext: () => observation.permissionContext });
    if (runnerResult.outcome !== "advanced" && runnerResult.outcome !== "complete") return { ...blocked(runnerResult.outcome === "uncertain" ? "uncertain_execution" : "runner_blocked", status, runnerResult.outcome === "uncertain" ? "uncertain" : runnerResult.outcome === "waiting" ? "waiting" : "blocked"), runnerResult };
    const edge = outgoing.find((item) => item.condition === "success"); if (!edge) return blocked("definition_invalid", status);
    const evidenceRef = "effectKey" in runnerResult ? runnerResult.effectKey : identity.effectKey;
    const receipt = makeStepReceipt({ sequence: receiptReplay.receipts.length, missionId: definition.missionId, definitionRevision: definition.definitionRevision, graphRevision: definition.graph.graphRevision,
      stepId: step.stepId, attempt, fromNodeId: node.nodeId, toNodeId: edge.toNodeId, edgeId: edge.edgeId, outcome: "success", evidenceRefs: [evidenceRef], previousReceiptDigest });
    const appended = await appendStepReceipt(receipt, dependencies.stepReceiptStore);
    if (appended !== "appended") return { ...blocked(appended === "uncertain" ? "uncertain_execution" : "readback_mismatch", status, appended === "uncertain" ? "uncertain" : "blocked"), runnerResult };
    return { outcome: "advanced", reasonCode: "complete", dispatchEffects: runnerResult.outcome === "advanced" ? 1 : 0, receipt, runnerResult, mackEvaluation: null, status: projectMissionStatusV1(definition, [...observation.stepReceipts, receipt], observation.completedEvidence) };
  }
  const mack = await runMackAdapter(definition, observation, step, attempt, dependencies.mack);
  if (mack.state === "blocked" || mack.state === "uncertain") return { ...blocked(mack.state === "uncertain" ? "uncertain_execution" : "mack_blocked", status, mack.state), dispatchEffects: mack.dispatchEffects, mackEvaluation: mack.evaluation };
  const condition = mack.state === "success" ? "success" : "repair";
  const edge = outgoing.find((item) => item.condition === condition && (receiptReplay.edgeCounts.get(item.edgeId) ?? 0) < item.maximumTraversals);
  if (!edge) return { ...blocked("repair_exhausted", status), dispatchEffects: mack.dispatchEffects, mackEvaluation: mack.evaluation };
  const receipt = makeStepReceipt({ sequence: receiptReplay.receipts.length, missionId: definition.missionId, definitionRevision: definition.definitionRevision, graphRevision: definition.graph.graphRevision,
    stepId: step.stepId, attempt, fromNodeId: node.nodeId, toNodeId: edge.toNodeId, edgeId: edge.edgeId, outcome: condition, evidenceRefs: mack.reportRef ? [mack.reportRef] : [], previousReceiptDigest });
  const appended = await appendStepReceipt(receipt, dependencies.stepReceiptStore);
  if (appended !== "appended") return { ...blocked(appended === "uncertain" ? "uncertain_execution" : "readback_mismatch", status, appended === "uncertain" ? "uncertain" : "blocked"), dispatchEffects: mack.dispatchEffects, mackEvaluation: mack.evaluation };
  return { outcome: "advanced", reasonCode: "complete", dispatchEffects: mack.dispatchEffects, receipt, runnerResult: null, mackEvaluation: mack.evaluation, status: projectMissionStatusV1(definition, [...observation.stepReceipts, receipt], observation.completedEvidence) };
}

export function missionBuilderBenchmarkV1(before: unknown, after: unknown): Readonly<{ state: "valid" | "invalid"; deltas: Readonly<Record<"hillTokens" | "handoffs" | "elapsedMilliseconds" | "repeatedContextReads" | "humanInterventions", number>> | null }> {
  const fields = ["hillTokens", "handoffs", "elapsedMilliseconds", "repeatedContextReads", "humanInterventions"] as const;
  if (!exact(before, fields) || !exact(after, fields) || fields.some((field) => !Number.isSafeInteger(before[field]) || !Number.isSafeInteger(after[field]) || (before[field] as number) < 0 || (after[field] as number) < 0)) return { state: "invalid", deltas: null };
  return { state: "valid", deltas: freeze(Object.fromEntries(fields.map((field) => [field, (after[field] as number) - (before[field] as number)])) as Record<typeof fields[number], number>) };
}
