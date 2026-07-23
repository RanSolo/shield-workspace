export const MACK_VALIDATION_CONTRACT_VERSION = "mack.validation.v0" as const;
export const MACK_RESULT_STATUSES = ["pass", "fail", "blocked", "inconclusive", "invalid_handoff"] as const;
export const MACK_LANE_OUTCOMES = ["pass", "fail", "unavailable", "misconfigured", "environment_blocked", "inconclusive"] as const;
export const MACK_ROUTES = ["may", "mack", "daisy", "fury", "simmons", "fitz", "coulson", "advance"] as const;
export const MACK_FINDING_CLASSES = ["production_defect", "test_defect", "environment_limitation", "coverage_gap", "advisory_gap"] as const;

export type MackResultStatusV0 = (typeof MACK_RESULT_STATUSES)[number];
export type MackLaneOutcomeV0 = (typeof MACK_LANE_OUTCOMES)[number];
export type MackRouteV0 = (typeof MACK_ROUTES)[number];
export type MackFindingClassV0 = (typeof MACK_FINDING_CLASSES)[number];

export interface MackExpectedBindingV0 {
  readonly missionId: string;
  readonly subjectId: string;
  readonly repository: string;
  readonly branch: string;
  readonly artifactRevisionId: string;
  readonly approvedTestSurfaces: readonly string[];
}

export interface MackValidationReportV0 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof MACK_VALIDATION_CONTRACT_VERSION;
  readonly assuranceKind: "host_asserted_non_authoritative";
  readonly missionId: string;
  readonly subjectId: string;
  readonly repository: string;
  readonly branch: string;
  readonly artifactRevisionId: string;
  readonly status: MackResultStatusV0;
  readonly scenarios: readonly Readonly<{ scenarioId: string; required: boolean; covered: boolean }>[];
  readonly lanes: readonly Readonly<{ laneId: string; commandId: string; outcome: MackLaneOutcomeV0 }>[];
  readonly findings: readonly Readonly<{ findingId: string; classification: MackFindingClassV0; route: MackRouteV0 }>[];
  readonly evidenceRefs: readonly string[];
  readonly limitations: readonly string[];
  readonly editedTestSurfaces: readonly string[];
  readonly recommendedRoute: MackRouteV0;
}

export type MackEvaluationV0 = Readonly<{
  state: "evaluated" | "invalid";
  contractVersion: typeof MACK_VALIDATION_CONTRACT_VERSION;
  authority: "non_authoritative";
  advancementEligibility: "eligible" | "ineligible";
  status: MackResultStatusV0;
  reasonCodes: readonly string[];
  binding: Readonly<MackExpectedBindingV0> | null;
  report: MackValidationReportV0 | null;
}>;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/@# +:=,-]+$/;
const REASONS = {
  malformed: "MALFORMED_REPORT",
  binding: "BINDING_MISMATCH",
  missingScenario: "REQUIRED_SCENARIO_UNCOVERED",
  unavailable: "VALIDATION_UNAVAILABLE",
  laneFailure: "VALIDATION_LANE_FAILED",
  editScope: "TEST_SURFACE_OUT_OF_SCOPE",
  route: "INVALID_ROUTE",
} as const;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
function text(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 512; }
function id(value: unknown): value is string { return typeof value === "string" && IDENTIFIER.test(value); }
function path(value: unknown): value is string { return typeof value === "string" && SAFE_PATH.test(value) && value.length <= 512; }
function stringArray(value: unknown, validator: (value: unknown) => value is string, max = 128): value is readonly string[] { return Array.isArray(value) && value.length <= max && value.every(validator) && new Set(value).size === value.length; }

function validBinding(input: unknown): input is MackExpectedBindingV0 {
  return exact(input, ["missionId", "subjectId", "repository", "branch", "artifactRevisionId", "approvedTestSurfaces"]) && id(input.missionId) && id(input.subjectId) && typeof input.repository === "string" && REPOSITORY.test(input.repository) && id(input.branch) && typeof input.artifactRevisionId === "string" && REVISION.test(input.artifactRevisionId) && stringArray(input.approvedTestSurfaces, path);
}

function validScenario(input: unknown): input is MackValidationReportV0["scenarios"][number] {
  return exact(input, ["scenarioId", "required", "covered"]) && id(input.scenarioId) && typeof input.required === "boolean" && typeof input.covered === "boolean";
}
function validLane(input: unknown): input is MackValidationReportV0["lanes"][number] {
  return exact(input, ["laneId", "commandId", "outcome"]) && id(input.laneId) && id(input.commandId) && MACK_LANE_OUTCOMES.includes(input.outcome as MackLaneOutcomeV0);
}
function validFinding(input: unknown): input is MackValidationReportV0["findings"][number] {
  return exact(input, ["findingId", "classification", "route"]) && id(input.findingId) && MACK_FINDING_CLASSES.includes(input.classification as MackFindingClassV0) && MACK_ROUTES.includes(input.route as MackRouteV0);
}
function validReport(input: unknown): input is MackValidationReportV0 {
  return exact(input, ["schemaVersion", "contractVersion", "assuranceKind", "missionId", "subjectId", "repository", "branch", "artifactRevisionId", "status", "scenarios", "lanes", "findings", "evidenceRefs", "limitations", "editedTestSurfaces", "recommendedRoute"]) &&
    input.schemaVersion === 1 && input.contractVersion === MACK_VALIDATION_CONTRACT_VERSION && input.assuranceKind === "host_asserted_non_authoritative" && id(input.missionId) && id(input.subjectId) && typeof input.repository === "string" && REPOSITORY.test(input.repository) && id(input.branch) && typeof input.artifactRevisionId === "string" && REVISION.test(input.artifactRevisionId) && MACK_RESULT_STATUSES.includes(input.status as MackResultStatusV0) && Array.isArray(input.scenarios) && input.scenarios.length <= 128 && input.scenarios.every(validScenario) && Array.isArray(input.lanes) && input.lanes.length <= 128 && input.lanes.every(validLane) && Array.isArray(input.findings) && input.findings.length <= 128 && input.findings.every(validFinding) && stringArray(input.evidenceRefs, text, 256) && stringArray(input.limitations, text, 64) && stringArray(input.editedTestSurfaces, path) && MACK_ROUTES.includes(input.recommendedRoute as MackRouteV0);
}

export function evaluateMackValidationV0(reportInput: unknown, expectedInput: unknown): MackEvaluationV0 {
  if (!validBinding(expectedInput) || !validReport(reportInput)) return { state: "invalid", contractVersion: MACK_VALIDATION_CONTRACT_VERSION, authority: "non_authoritative", advancementEligibility: "ineligible", status: "invalid_handoff", reasonCodes: [REASONS.malformed], binding: null, report: null };
  const report = reportInput;
  const expected = expectedInput;
  const bindingMatches = report.missionId === expected.missionId && report.subjectId === expected.subjectId && report.repository === expected.repository && report.branch === expected.branch && report.artifactRevisionId === expected.artifactRevisionId;
  const editScopeValid = report.editedTestSurfaces.every((surface) => expected.approvedTestSurfaces.includes(surface));
  const requiredCovered = report.scenarios.filter((scenario) => scenario.required).every((scenario) => scenario.covered);
  const unavailable = report.lanes.some((lane) => ["unavailable", "misconfigured", "environment_blocked"].includes(lane.outcome));
  const laneFailed = report.lanes.some((lane) => lane.outcome === "fail");
  const reasons: string[] = [];
  if (!bindingMatches) reasons.push(REASONS.binding);
  if (!editScopeValid) reasons.push(REASONS.editScope);
  if (!requiredCovered) reasons.push(REASONS.missingScenario);
  if (unavailable) reasons.push(REASONS.unavailable);
  if (laneFailed) reasons.push(REASONS.laneFailure);
  const status = reasons.length > 0 ? (bindingMatches && editScopeValid ? "inconclusive" : "invalid_handoff") : report.status;
  const eligible = status === "pass" && report.status === "pass" && reasons.length === 0;
  return { state: "evaluated", contractVersion: MACK_VALIDATION_CONTRACT_VERSION, authority: "non_authoritative", advancementEligibility: eligible ? "eligible" : "ineligible", status, reasonCodes: Object.freeze(reasons), binding: Object.freeze({ ...expected, approvedTestSurfaces: Object.freeze([...expected.approvedTestSurfaces]) }), report: Object.freeze({ ...report }) };
}

