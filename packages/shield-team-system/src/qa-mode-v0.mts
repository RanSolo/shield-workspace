import {
  evaluateMackValidationV0,
  type MackExpectedBindingV0,
  type MackValidationReportV0,
} from "./mack-validation-v0.mjs";

export const QA_MODE_SCHEMA_VERSION = 1 as const;
export const QA_MODE_CONTRACT_VERSION = "qa.mode.v0" as const;
export const QA_OUTCOMES = ["pass", "fail", "blocked", "inconclusive", "invalid_handoff"] as const;
export const QA_ROUTES = ["may", "mack", "daisy", "fury", "simmons", "fitz", "coulson", "advance"] as const;
export const QA_SCENARIO_KINDS = ["happy_path", "boundary_null", "binding_mismatch", "refresh_stale", "non_applicable", "regression"] as const;
export const QA_REASON_CODES = [
  "MALFORMED_HANDOFF",
  "HANDOFF_BINDING_MISMATCH",
  "BRIEF_BINDING_MISMATCH",
  "ACCEPTANCE_CRITERION_MISMATCH",
  "REQUIRED_SCENARIO_MISSING",
  "APPROVED_LANE_MISMATCH",
  "EVIDENCE_REFERENCE_MISMATCH",
  "ROUTE_MISMATCH",
  "MACK_VALIDATION_INELIGIBLE",
] as const;

export type QaOutcomeV0 = (typeof QA_OUTCOMES)[number];
export type QaRouteV0 = (typeof QA_ROUTES)[number];
export type QaScenarioKindV0 = (typeof QA_SCENARIO_KINDS)[number];
export type QaReasonCodeV0 = (typeof QA_REASON_CODES)[number];

export interface QaScenarioV0 {
  readonly scenarioId: string;
  readonly kind: QaScenarioKindV0;
  readonly acceptanceCriterionRef: string;
  readonly required: true;
}

export interface QaApprovedLaneV0 {
  readonly laneId: string;
  readonly commandId: string;
  readonly evidenceRef: string;
}

export interface QaAcceptanceCriterionV0 {
  readonly criterionId: string;
  readonly text: string;
}

export interface QaHandoffInputV0 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof QA_MODE_CONTRACT_VERSION;
  readonly missionId: string;
  readonly subjectId: string;
  readonly missionBriefRevisionId: string;
  readonly repository: string;
  readonly branch: string;
  readonly artifactRevisionId: string;
  readonly acceptanceCriteria: readonly QaAcceptanceCriterionV0[];
  readonly scenarios: readonly QaScenarioV0[];
  readonly approvedLanes: readonly QaApprovedLaneV0[];
  readonly approvedTestSurfaces: readonly string[];
}

export interface QaValidationEnvelopeV0 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof QA_MODE_CONTRACT_VERSION;
  readonly missionBriefRevisionId: string;
  readonly mackReport: unknown;
}

export interface QaExecutionPlanV0 {
  readonly state: "ready" | "invalid";
  readonly authority: "non_authoritative";
  readonly missionId: string;
  readonly artifactRevisionId: string;
  readonly lanes: readonly QaApprovedLaneV0[];
  readonly reasonCodes: readonly QaReasonCodeV0[];
}

export interface QaHandoffV0 extends QaHandoffInputV0 {
  readonly ownership: Readonly<{
    implementationSeatId: "may";
    validationSeatId: "mack";
    routingSeatId: "hill";
  }>;
  readonly routePolicy: Readonly<{
    production_defect: "may";
    test_defect: "mack";
    environment_limitation: "daisy";
    coverage_gap: "mack";
    advisory_gap: "hill";
  }>;
}

export type QaHandoffResultV0 =
  | { readonly state: "ready"; readonly authority: "non_authoritative"; readonly handoff: Readonly<QaHandoffV0> }
  | { readonly state: "invalid"; readonly authority: "non_authoritative"; readonly reasonCodes: readonly QaReasonCodeV0[] };

export type QaEvaluationV0 =
  | {
      readonly state: "evaluated";
      readonly authority: "non_authoritative";
      readonly outcome: QaOutcomeV0;
      readonly advancementEligibility: "eligible" | "ineligible";
      readonly reasonCodes: readonly QaReasonCodeV0[];
      readonly route: QaRouteV0;
      readonly routeEvidence: readonly Readonly<{ findingId: string; route: QaRouteV0 }>[];
      readonly mackEvaluation: ReturnType<typeof evaluateMackValidationV0>;
    }
  | {
      readonly state: "invalid";
      readonly authority: "non_authoritative";
      readonly outcome: "invalid_handoff";
      readonly advancementEligibility: "ineligible";
      readonly reasonCodes: readonly QaReasonCodeV0[];
      readonly route: "coulson" | "hill";
      readonly routeEvidence: readonly [];
    };

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/@# +:=,-]+$/;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
function id(value: unknown): value is string { return typeof value === "string" && IDENTIFIER.test(value); }
function text(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= 1000; }
function path(value: unknown): value is string { return typeof value === "string" && SAFE_PATH.test(value) && value.length <= 512; }
function uniqueStrings(value: unknown, validator: (value: unknown) => value is string, max = 128): value is readonly string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= max && value.every(validator) && new Set(value).size === value.length;
}

function validScenario(value: unknown): value is QaScenarioV0 {
  return exact(value, ["scenarioId", "kind", "acceptanceCriterionRef", "required"]) && id(value.scenarioId) && QA_SCENARIO_KINDS.includes(value.kind as QaScenarioKindV0) && id(value.acceptanceCriterionRef) && value.required === true;
}
function validLane(value: unknown): value is QaApprovedLaneV0 {
  return exact(value, ["laneId", "commandId", "evidenceRef"]) && id(value.laneId) && id(value.commandId) && id(value.evidenceRef);
}
function validCriterion(value: unknown): value is QaAcceptanceCriterionV0 {
  return exact(value, ["criterionId", "text"]) && id(value.criterionId) && text(value.text);
}
function validHandoff(value: unknown): value is QaHandoffInputV0 {
  return exact(value, ["schemaVersion", "contractVersion", "missionId", "subjectId", "missionBriefRevisionId", "repository", "branch", "artifactRevisionId", "acceptanceCriteria", "scenarios", "approvedLanes", "approvedTestSurfaces"]) &&
    value.schemaVersion === 1 && value.contractVersion === QA_MODE_CONTRACT_VERSION && id(value.missionId) && id(value.subjectId) && id(value.missionBriefRevisionId) && typeof value.repository === "string" && REPOSITORY.test(value.repository) && id(value.branch) && typeof value.artifactRevisionId === "string" && REVISION.test(value.artifactRevisionId) && Array.isArray(value.acceptanceCriteria) && value.acceptanceCriteria.length > 0 && value.acceptanceCriteria.length <= 128 && value.acceptanceCriteria.every(validCriterion) && new Set((value.acceptanceCriteria as readonly QaAcceptanceCriterionV0[]).map((criterion) => criterion.criterionId)).size === value.acceptanceCriteria.length && Array.isArray(value.scenarios) && value.scenarios.length > 0 && value.scenarios.length <= 128 && value.scenarios.every(validScenario) && new Set(value.scenarios.map((scenario) => scenario.scenarioId)).size === value.scenarios.length && value.scenarios.every((scenario) => (value.acceptanceCriteria as readonly QaAcceptanceCriterionV0[]).some((criterion) => criterion.criterionId === scenario.acceptanceCriterionRef)) && Array.isArray(value.approvedLanes) && value.approvedLanes.length > 0 && value.approvedLanes.length <= 128 && value.approvedLanes.every(validLane) && new Set(value.approvedLanes.map((lane) => lane.laneId)).size === value.approvedLanes.length && Array.isArray(value.approvedTestSurfaces) && value.approvedTestSurfaces.length <= 128 && value.approvedTestSurfaces.every(path) && new Set(value.approvedTestSurfaces).size === value.approvedTestSurfaces.length;
}

export function createQaHandoffV0(input: unknown): QaHandoffResultV0 {
  if (!validHandoff(input)) return { state: "invalid", authority: "non_authoritative", reasonCodes: ["MALFORMED_HANDOFF"] };
  const handoff: QaHandoffV0 = {
    ...input,
    ownership: { implementationSeatId: "may", validationSeatId: "mack", routingSeatId: "hill" },
    routePolicy: { production_defect: "may", test_defect: "mack", environment_limitation: "daisy", coverage_gap: "mack", advisory_gap: "hill" },
  };
  return { state: "ready", authority: "non_authoritative", handoff: Object.freeze({ ...handoff, scenarios: Object.freeze([...handoff.scenarios]), approvedLanes: Object.freeze([...handoff.approvedLanes]), acceptanceCriteria: Object.freeze(handoff.acceptanceCriteria.map((criterion) => Object.freeze({ ...criterion }))), approvedTestSurfaces: Object.freeze([...handoff.approvedTestSurfaces]) }) };
}

export function prepareQaExecutionPlanV0(handoffInput: unknown): QaExecutionPlanV0 {
  if (!validHandoff(handoffInput)) return { state: "invalid", authority: "non_authoritative", missionId: "invalid", artifactRevisionId: "invalid", lanes: [], reasonCodes: ["MALFORMED_HANDOFF"] };
  return { state: "ready", authority: "non_authoritative", missionId: handoffInput.missionId, artifactRevisionId: handoffInput.artifactRevisionId, lanes: Object.freeze(handoffInput.approvedLanes.map((lane) => Object.freeze({ ...lane }))), reasonCodes: [] };
}

function validEnvelope(value: unknown): value is QaValidationEnvelopeV0 {
  return exact(value, ["schemaVersion", "contractVersion", "missionBriefRevisionId", "mackReport"]) && value.schemaVersion === 1 && value.contractVersion === QA_MODE_CONTRACT_VERSION && id(value.missionBriefRevisionId) && value.mackReport !== undefined;
}

function expectedBinding(handoff: QaHandoffInputV0): MackExpectedBindingV0 {
  return { missionId: handoff.missionId, subjectId: handoff.subjectId, repository: handoff.repository, branch: handoff.branch, artifactRevisionId: handoff.artifactRevisionId, approvedTestSurfaces: handoff.approvedTestSurfaces };
}

export function evaluateQaValidationV0(handoffInput: unknown, envelopeInput: unknown): QaEvaluationV0 {
  if (!validHandoff(handoffInput)) return { state: "invalid", authority: "non_authoritative", outcome: "invalid_handoff", advancementEligibility: "ineligible", reasonCodes: ["MALFORMED_HANDOFF"], route: "coulson", routeEvidence: [] };
  const handoff = handoffInput;
  if (!validEnvelope(envelopeInput)) return { state: "invalid", authority: "non_authoritative", outcome: "invalid_handoff", advancementEligibility: "ineligible", reasonCodes: ["BRIEF_BINDING_MISMATCH"], route: "hill", routeEvidence: [] };
  const envelope = envelopeInput;
  if (envelope.missionBriefRevisionId !== handoff.missionBriefRevisionId) return { state: "invalid", authority: "non_authoritative", outcome: "invalid_handoff", advancementEligibility: "ineligible", reasonCodes: ["BRIEF_BINDING_MISMATCH"], route: "hill", routeEvidence: [] };
  const mackEvaluation = evaluateMackValidationV0(envelope.mackReport, expectedBinding(handoff));
  if (mackEvaluation.state === "invalid") return { state: "invalid", authority: "non_authoritative", outcome: "invalid_handoff", advancementEligibility: "ineligible", reasonCodes: ["MACK_VALIDATION_INELIGIBLE"], route: "hill", routeEvidence: [] };
  const report = mackEvaluation.report as MackValidationReportV0;
  const requiredIds = new Set(handoff.scenarios.map((scenario) => scenario.scenarioId));
  const reportedIds = new Set(report.scenarios.map((scenario) => scenario.scenarioId));
  const allowedLanes = new Map(handoff.approvedLanes.map((lane) => [lane.laneId, lane.commandId]));
  const reasons: QaReasonCodeV0[] = [];
  if ([...requiredIds].some((scenarioId) => !reportedIds.has(scenarioId))) reasons.push("REQUIRED_SCENARIO_MISSING");
  if ([...requiredIds].some((scenarioId) => !report.scenarios.some((scenario) => scenario.scenarioId === scenarioId && scenario.covered))) reasons.push("REQUIRED_SCENARIO_MISSING");
  if (report.lanes.some((lane) => allowedLanes.get(lane.laneId) !== lane.commandId)) reasons.push("APPROVED_LANE_MISMATCH");
  if (report.lanes.some((lane) => !report.evidenceRefs.includes(handoff.approvedLanes.find((approved) => approved.laneId === lane.laneId)?.evidenceRef ?? ""))) reasons.push("EVIDENCE_REFERENCE_MISMATCH");
  const routePolicy = { production_defect: "may", test_defect: "mack", environment_limitation: "daisy", coverage_gap: "mack", advisory_gap: "hill" } as const;
  if (report.findings.some((finding) => routePolicy[finding.classification] !== finding.route)) reasons.push("ROUTE_MISMATCH");
  if (mackEvaluation.advancementEligibility === "ineligible") reasons.push("MACK_VALIDATION_INELIGIBLE");
  const bindingMismatch = mackEvaluation.reasonCodes.includes("BINDING_MISMATCH");
  const outcome: QaOutcomeV0 = reasons.length === 0 ? report.status : (bindingMismatch || reasons.includes("APPROVED_LANE_MISMATCH") ? "invalid_handoff" : (reasons.includes("MACK_VALIDATION_INELIGIBLE") && report.status === "invalid_handoff" ? "invalid_handoff" : "inconclusive"));
  const routeEvidence = Object.freeze(report.findings.map((finding) => ({ findingId: finding.findingId, route: finding.route as QaRouteV0 })));
  const route: QaRouteV0 = routeEvidence[0]?.route ?? (outcome === "pass" ? "advance" : "hill");
  return { state: "evaluated", authority: "non_authoritative", outcome, advancementEligibility: outcome === "pass" && reasons.length === 0 ? "eligible" : "ineligible", reasonCodes: Object.freeze(reasons), route, routeEvidence, mackEvaluation };
}
