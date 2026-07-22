export const PIPELINE_PROFILE_SCHEMA_VERSION = 1 as const;
export const PIPELINE_PROFILE_CONTRACT_VERSION = "pipeline.profile.v1" as const;
export const PIPELINE_MODE_IDS = [
  "lint",
  "typecheck",
  "unit-test",
  "integration-test",
  "e2e",
  "build",
  "sonarqube",
  "package-audit",
  "migration-validation",
  "security-scan",
  "full-pipeline",
] as const;
export const PIPELINE_RISK_TRIGGERS = [
  "database-change",
  "user-flow-change",
  "dependency-change",
  "security-sensitive-change",
  "architecture-change",
] as const;
export const PIPELINE_EVIDENCE_KINDS = [
  "package-script",
  "nx-target",
  "project-target",
  "ci-workflow",
  "sonarqube-config",
  "repository-instruction",
  "validation-doc",
  "user-supplied-command",
] as const;
export const PIPELINE_UNAVAILABLE_REASONS = ["not-discovered", "ambiguous", "unsupported", "missing-command"] as const;
export const PIPELINE_SELECTION_REASON_CODES = [
  "INVALID_PROFILE",
  "INVALID_SELECTION_REQUEST",
  "PROFILE_BINDING_MISMATCH",
  "PROFILE_STALE",
  "UNSUPPORTED_REQUIRED_MODE",
  "SCOPE_REVIEW_REQUIRED",
] as const;

export type PipelineModeId = (typeof PIPELINE_MODE_IDS)[number];
export type PipelineRiskTrigger = (typeof PIPELINE_RISK_TRIGGERS)[number];
export type PipelineEvidenceKind = (typeof PIPELINE_EVIDENCE_KINDS)[number];
export type PipelineUnavailableReason = (typeof PIPELINE_UNAVAILABLE_REASONS)[number];
export type PipelineSelectionReasonCode = (typeof PIPELINE_SELECTION_REASON_CODES)[number];

export interface PipelineCommandBindingV1 {
  commandId: string;
  executable: string;
  args: readonly string[];
}

export interface PipelineModeBindingV1 {
  modeId: PipelineModeId;
  evidenceKind: PipelineEvidenceKind;
  evidenceRef: string;
  command: PipelineCommandBindingV1 | null;
}

export interface PipelineConditionalRuleV1 {
  trigger: PipelineRiskTrigger;
  modes: readonly PipelineModeId[];
  evidenceRef: string;
}

export interface PipelineUnavailableModeV1 {
  modeId: PipelineModeId;
  reason: PipelineUnavailableReason;
  evidenceRef: string;
}

export interface RepositoryPipelineProfileV1 {
  schemaVersion: 1;
  contractVersion: "pipeline.profile.v1";
  profileId: string;
  repository: string;
  artifactRevisionId: string;
  discoveredAt: string;
  supported: readonly PipelineModeBindingV1[];
  defaultModes: readonly PipelineModeId[];
  conditional: readonly PipelineConditionalRuleV1[];
  unavailable: readonly PipelineUnavailableModeV1[];
  staleWhenChanged: readonly string[];
}

export interface PipelineSelectionRequestV1 {
  schemaVersion: 1;
  missionId: string;
  subjectId: string;
  repository: string;
  artifactRevisionId: string;
  changedFiles: readonly string[];
  riskTriggers: readonly PipelineRiskTrigger[];
  requestedModes: readonly PipelineModeId[];
  additionalModeRequests: readonly {
    requestedBySeatId: "hill" | "mack";
    modeId: PipelineModeId;
    rationale: string;
    withinMissionScope: boolean;
  }[];
}

export type PipelineModeSelectionV1 =
  | {
      state: "selected";
      schemaVersion: 1;
      contractVersion: "pipeline.profile.v1";
      authority: "non_authoritative";
      missionModeBoundary: "mission_modes_govern_workflow_pipeline_modes_govern_validation_lanes";
      interimOwnership: "hill_selects_may_runs_implementation_coupled_checks_hill_verifies";
      futureMackOwnership: "mack_executes_and_interprets_validation_without_implementation_or_authority";
      selectionEligibility: "eligible" | "ineligible";
      reasonCodes: readonly PipelineSelectionReasonCode[];
      missionId: string;
      subjectId: string;
      repository: string;
      artifactRevisionId: string;
      selectedModes: readonly PipelineModeBindingV1[];
      unavailableModes: readonly PipelineUnavailableModeV1[];
    }
  | {
      state: "invalid";
      schemaVersion: 1;
      authority: "non_authoritative";
      selectionEligibility: "ineligible";
      reasonCodes: readonly PipelineSelectionReasonCode[];
    };

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/;
const IMMUTABLE_REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{40,64})$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/@# +:=,-]+$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const MODE_SET = new Set<PipelineModeId>(PIPELINE_MODE_IDS);
const TRIGGER_SET = new Set<PipelineRiskTrigger>(PIPELINE_RISK_TRIGGERS);

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function boundedText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 1000;
}

function safePath(value: unknown): value is string {
  return typeof value === "string" && SAFE_PATH.test(value);
}

function modeId(value: unknown): value is PipelineModeId {
  return typeof value === "string" && MODE_SET.has(value as PipelineModeId);
}

function trigger(value: unknown): value is PipelineRiskTrigger {
  return typeof value === "string" && TRIGGER_SET.has(value as PipelineRiskTrigger);
}

function validCommand(input: unknown): input is PipelineCommandBindingV1 {
  if (!exact(input, ["commandId", "executable", "args"])) return false;
  return identifier(input.commandId) &&
    identifier(input.executable) &&
    Array.isArray(input.args) &&
    input.args.length <= 16 &&
    input.args.every((arg) => typeof arg === "string" && arg.length <= 200);
}

function validBinding(input: unknown): input is PipelineModeBindingV1 {
  if (!exact(input, ["modeId", "evidenceKind", "evidenceRef", "command"])) return false;
  if (!modeId(input.modeId)) return false;
  if (!PIPELINE_EVIDENCE_KINDS.includes(input.evidenceKind as PipelineEvidenceKind)) return false;
  if (!identifier(input.evidenceRef)) return false;
  if (input.command !== null && !validCommand(input.command)) return false;
  return input.command !== null || input.modeId === "sonarqube";
}

function validConditional(input: unknown): input is PipelineConditionalRuleV1 {
  if (!exact(input, ["trigger", "modes", "evidenceRef"])) return false;
  return trigger(input.trigger) &&
    Array.isArray(input.modes) &&
    input.modes.length > 0 &&
    input.modes.length <= PIPELINE_MODE_IDS.length &&
    input.modes.every(modeId) &&
    identifier(input.evidenceRef);
}

function validUnavailable(input: unknown): input is PipelineUnavailableModeV1 {
  if (!exact(input, ["modeId", "reason", "evidenceRef"])) return false;
  return modeId(input.modeId) &&
    PIPELINE_UNAVAILABLE_REASONS.includes(input.reason as PipelineUnavailableReason) &&
    identifier(input.evidenceRef);
}

function validProfile(input: unknown): input is RepositoryPipelineProfileV1 {
  if (!exact(input, ["schemaVersion", "contractVersion", "profileId", "repository", "artifactRevisionId", "discoveredAt", "supported", "defaultModes", "conditional", "unavailable", "staleWhenChanged"])) return false;
  if (input.schemaVersion !== 1 || input.contractVersion !== PIPELINE_PROFILE_CONTRACT_VERSION) return false;
  if (!identifier(input.profileId) || typeof input.repository !== "string" || !REPOSITORY.test(input.repository)) return false;
  if (typeof input.artifactRevisionId !== "string" || !IMMUTABLE_REVISION.test(input.artifactRevisionId)) return false;
  if (typeof input.discoveredAt !== "string" || !ISO_UTC.test(input.discoveredAt) || !Number.isFinite(Date.parse(input.discoveredAt))) return false;
  if (!Array.isArray(input.supported) || !Array.isArray(input.defaultModes) || !Array.isArray(input.conditional) || !Array.isArray(input.unavailable) || !Array.isArray(input.staleWhenChanged)) return false;
  if (input.supported.length > PIPELINE_MODE_IDS.length || input.defaultModes.length > PIPELINE_MODE_IDS.length || input.unavailable.length > PIPELINE_MODE_IDS.length || input.conditional.length > PIPELINE_RISK_TRIGGERS.length) return false;
  if (!input.supported.every(validBinding) || !input.defaultModes.every(modeId) || !input.conditional.every(validConditional) || !input.unavailable.every(validUnavailable) || !input.staleWhenChanged.every(safePath)) return false;
  const supported = new Set(input.supported.map((binding) => binding.modeId));
  const unavailable = new Set(input.unavailable.map((item) => item.modeId));
  if (supported.size !== input.supported.length || unavailable.size !== input.unavailable.length) return false;
  for (const mode of input.defaultModes) if (!supported.has(mode)) return false;
  for (const rule of input.conditional) for (const mode of rule.modes) if (!supported.has(mode)) return false;
  for (const mode of supported) if (unavailable.has(mode)) return false;
  return true;
}

function validRequest(input: unknown): input is PipelineSelectionRequestV1 {
  if (!exact(input, ["schemaVersion", "missionId", "subjectId", "repository", "artifactRevisionId", "changedFiles", "riskTriggers", "requestedModes", "additionalModeRequests"])) return false;
  if (input.schemaVersion !== 1 || !identifier(input.missionId) || !identifier(input.subjectId)) return false;
  if (typeof input.repository !== "string" || !REPOSITORY.test(input.repository)) return false;
  if (typeof input.artifactRevisionId !== "string" || !IMMUTABLE_REVISION.test(input.artifactRevisionId)) return false;
  if (!Array.isArray(input.changedFiles) || !Array.isArray(input.riskTriggers) || !Array.isArray(input.requestedModes) || !Array.isArray(input.additionalModeRequests)) return false;
  if (input.changedFiles.length > 256 || input.riskTriggers.length > PIPELINE_RISK_TRIGGERS.length || input.requestedModes.length > PIPELINE_MODE_IDS.length || input.additionalModeRequests.length > PIPELINE_MODE_IDS.length) return false;
  if (!input.changedFiles.every(safePath) || !input.riskTriggers.every(trigger) || !input.requestedModes.every(modeId)) return false;
  return input.additionalModeRequests.every((request) =>
    exact(request, ["requestedBySeatId", "modeId", "rationale", "withinMissionScope"]) &&
    (request.requestedBySeatId === "hill" || request.requestedBySeatId === "mack") &&
    modeId(request.modeId) &&
    boundedText(request.rationale) &&
    typeof request.withinMissionScope === "boolean"
  );
}

export function selectPipelineModesV1(profileInput: unknown, requestInput: unknown): PipelineModeSelectionV1 {
  if (!validProfile(profileInput)) {
    return { state: "invalid", schemaVersion: 1, authority: "non_authoritative", selectionEligibility: "ineligible", reasonCodes: ["INVALID_PROFILE"] };
  }
  if (!validRequest(requestInput)) {
    return { state: "invalid", schemaVersion: 1, authority: "non_authoritative", selectionEligibility: "ineligible", reasonCodes: ["INVALID_SELECTION_REQUEST"] };
  }
  const profile = profileInput;
  const request = requestInput;
  if (profile.repository !== request.repository || profile.artifactRevisionId !== request.artifactRevisionId) {
    return { state: "invalid", schemaVersion: 1, authority: "non_authoritative", selectionEligibility: "ineligible", reasonCodes: ["PROFILE_BINDING_MISMATCH"] };
  }
  const profileStale = request.changedFiles.some((changedFile) =>
    profile.staleWhenChanged.some((stalePath) => changedFile === stalePath || changedFile.startsWith(`${stalePath}/`))
  );
  const supported = new Map(profile.supported.map((binding) => [binding.modeId, binding] as const));
  const unavailable = new Map(profile.unavailable.map((item) => [item.modeId, item] as const));
  const selected = new Set<PipelineModeId>(profile.defaultModes);
  for (const rule of profile.conditional) {
    if (request.riskTriggers.includes(rule.trigger)) for (const mode of rule.modes) selected.add(mode);
  }
  for (const mode of request.requestedModes) selected.add(mode);
  const requestedUnavailable: PipelineUnavailableModeV1[] = [];
  const reasonCodes: PipelineSelectionReasonCode[] = [];
  if (profileStale) reasonCodes.push("PROFILE_STALE");
  for (const additionalRequest of request.additionalModeRequests) {
    if (!additionalRequest.withinMissionScope) reasonCodes.push("SCOPE_REVIEW_REQUIRED");
    selected.add(additionalRequest.modeId);
  }
  const selectedModes: PipelineModeBindingV1[] = [];
  for (const mode of selected) {
    const binding = supported.get(mode);
    if (binding) selectedModes.push(binding);
    else requestedUnavailable.push(unavailable.get(mode) ?? { modeId: mode, reason: "not-discovered", evidenceRef: "pipeline:unavailable:not-discovered" });
  }
  if (requestedUnavailable.length > 0) reasonCodes.push("UNSUPPORTED_REQUIRED_MODE");
  const uniqueReasons = PIPELINE_SELECTION_REASON_CODES.filter((reason) => reasonCodes.includes(reason));
  return {
    state: "selected",
    schemaVersion: 1,
    contractVersion: PIPELINE_PROFILE_CONTRACT_VERSION,
    authority: "non_authoritative",
    missionModeBoundary: "mission_modes_govern_workflow_pipeline_modes_govern_validation_lanes",
    interimOwnership: "hill_selects_may_runs_implementation_coupled_checks_hill_verifies",
    futureMackOwnership: "mack_executes_and_interprets_validation_without_implementation_or_authority",
    selectionEligibility: uniqueReasons.length === 0 ? "eligible" : "ineligible",
    reasonCodes: uniqueReasons,
    missionId: request.missionId,
    subjectId: request.subjectId,
    repository: request.repository,
    artifactRevisionId: request.artifactRevisionId,
    selectedModes,
    unavailableModes: requestedUnavailable,
  };
}
