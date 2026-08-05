import { createHash } from "node:crypto";

import { canonicalJson } from "./mission-v2.mjs";
import {
  evaluateMackValidationV0,
  type MackExpectedBindingV0,
  type MackFindingClassV0,
  type MackLaneOutcomeV0,
  type MackRouteV0,
  type MackValidationReportV0,
} from "./mack-validation-v0.mjs";

export const MACK_LOCAL_VALIDATION_CONTRACT_VERSION = "mack.local-validation.v1" as const;
export const MACK_LOCAL_VALIDATION_EXECUTOR_ID = "executor:local-mack-validation-v1" as const;
export const MACK_LOCAL_MODEL_ASSESSMENTS = ["satisfied", "failed", "uncertain"] as const;

export type MackLocalModelAssessmentV1 = (typeof MACK_LOCAL_MODEL_ASSESSMENTS)[number];

export interface MackLocalValidationScenarioV1 {
  readonly scenarioId: string;
  readonly required: boolean;
  readonly description: string;
}

export interface MackLocalEnvironmentEntryV1 {
  readonly name: string;
  readonly value: string;
}

export interface MackLocalValidationLaneV1 {
  readonly laneId: string;
  readonly commandId: string;
  readonly executable: string;
  readonly executableSha256: string;
  readonly argv: readonly string[];
  readonly workingDirectory: string;
  readonly timeoutMs: number;
  readonly environment: readonly MackLocalEnvironmentEntryV1[];
  readonly required: boolean;
  readonly scenarioIds: readonly string[];
}

export interface MackLocalFrozenBytesV1 {
  readonly contentBase64: string;
  readonly sha256: string;
  readonly truncated: false;
}

export interface MackLocalRepositorySourceV1 extends MackLocalFrozenBytesV1 {
  readonly path: string;
}

export interface MackLocalMissionArtifactV1 extends MackLocalFrozenBytesV1 {
  readonly artifactId: string;
  readonly path: string;
}

export interface MackLocalValidationRequestV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof MACK_LOCAL_VALIDATION_CONTRACT_VERSION;
  readonly seatId: "mack";
  readonly missionId: string;
  readonly missionRevisionId: string;
  readonly subjectId: string;
  readonly repository: string;
  readonly repositoryRoot: string;
  readonly canonicalGitDirectory: string;
  readonly branch: string;
  readonly baseRevisionId: string;
  readonly artifactRevisionId: string;
  readonly validationRequestId: string;
  readonly model: Readonly<{
    provider: "lmstudio";
    baseUrl: string;
    modelKey: string;
  }>;
  readonly toolExecutorId: typeof MACK_LOCAL_VALIDATION_EXECUTOR_ID;
  readonly scenarios: readonly MackLocalValidationScenarioV1[];
  readonly lanes: readonly MackLocalValidationLaneV1[];
  readonly approvedTestSurfaces: readonly string[];
  readonly repositoryContext: Readonly<{
    implementationPaths: readonly string[];
    diff: Readonly<MackLocalFrozenBytesV1>;
    sources: readonly Readonly<MackLocalRepositorySourceV1>[];
  }>;
  readonly missionArtifacts: readonly Readonly<MackLocalMissionArtifactV1>[];
}

export interface MackLocalGitObservationV1 {
  readonly repository: string;
  readonly canonicalRepositoryRoot: string;
  readonly canonicalTopLevel: string;
  readonly canonicalGitDirectory: string;
  readonly branch: string;
  readonly headRevisionId: string;
  readonly statusPorcelainBytes: number;
  readonly statusPorcelainSha256: string;
  readonly changedPaths: readonly string[];
}

export interface MackLocalRuntimeObservationV1 {
  readonly provider: "lmstudio";
  readonly origin: string;
  readonly observedModelKey: string;
  readonly loadedInstanceId: string;
}

export interface MackLocalCommandOutputV1 {
  readonly sha256: string;
  readonly bytes: number;
  readonly truncated: boolean;
}

export interface MackLocalCommandReceiptV1 {
  readonly laneId: string;
  readonly commandId: string;
  readonly executable: string;
  readonly executableSha256: string;
  readonly argv: readonly string[];
  readonly workingDirectory: string;
  readonly environment: readonly MackLocalEnvironmentEntryV1[];
  readonly startedAt: string;
  readonly endedAt: string;
  readonly exitCode: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly launchError: string | null;
  readonly stdout: Readonly<MackLocalCommandOutputV1>;
  readonly stderr: Readonly<MackLocalCommandOutputV1>;
}

export interface MackLocalModelAnalysisV1 {
  readonly scenarioAssessments: readonly Readonly<{
    scenarioId: string;
    assessment: MackLocalModelAssessmentV1;
    summary: string;
  }>[];
  readonly findings: readonly Readonly<{
    findingId: string;
    classification: MackFindingClassV0;
    route: MackRouteV0;
  }>[];
  readonly limitations: readonly string[];
  readonly recommendedRoute: MackRouteV0;
}

export interface MackLocalEvidenceCreationInputV1 {
  readonly request: MackLocalValidationRequestV1;
  readonly requestDigest: string;
  readonly preInferenceGit: MackLocalGitObservationV1;
  readonly postInferenceGit: MackLocalGitObservationV1;
  readonly preInferenceRuntime: MackLocalRuntimeObservationV1;
  readonly postInferenceRuntime: MackLocalRuntimeObservationV1;
  readonly commandReceipts: readonly MackLocalCommandReceiptV1[];
  readonly repositoryContextVerified: boolean;
  readonly missionArtifactsVerified: boolean;
  readonly promptSha256: string;
  readonly responseSha256: string;
  readonly providerCounters: Readonly<{
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  }>;
  readonly modelAnalysis: MackLocalModelAnalysisV1;
}

export type MackLocalValidationEvidenceV1 = Readonly<{
  evidenceSchemaVersion: 1;
  contractVersion: typeof MACK_LOCAL_VALIDATION_CONTRACT_VERSION;
  authority: "non_authoritative";
  validationRequestId: string;
  requestDigest: string;
  seatId: "mack";
  missionId: string;
  missionRevisionId: string;
  subjectId: string;
  repository: string;
  repositoryRoot: string;
  canonicalGitDirectory: string;
  branch: string;
  baseRevisionId: string;
  artifactRevisionId: string;
  implementationPaths: readonly string[];
  reasoningRuntimeId: string;
  reasoningModel: string;
  provider: "lmstudio";
  providerOrigin: string;
  toolExecutorId: typeof MACK_LOCAL_VALIDATION_EXECUTOR_ID;
  preInferenceGit: MackLocalGitObservationV1;
  postInferenceGit: MackLocalGitObservationV1;
  preInferenceRuntime: MackLocalRuntimeObservationV1;
  postInferenceRuntime: MackLocalRuntimeObservationV1;
  commandReceipts: readonly MackLocalCommandReceiptV1[];
  repositoryContextVerified: boolean;
  missionArtifactsVerified: boolean;
  promptSha256: string;
  responseSha256: string;
  providerCounters: MackLocalEvidenceCreationInputV1["providerCounters"];
  modelAnalysis: MackLocalModelAnalysisV1;
  report: MackValidationReportV0;
  evaluation: ReturnType<typeof evaluateMackValidationV0>;
  evidenceSource: "production" | "synthetic";
  productionEligibility: "eligible" | "ineligible";
  advancementEligibility: "eligible" | "ineligible";
  reasonCodes: readonly string[];
  evidenceDigest: string;
}>;

export type MackLocalValidationRequestNormalizationV1 =
  | { readonly state: "valid"; readonly value: MackLocalValidationRequestV1; readonly requestDigest: string }
  | { readonly state: "invalid"; readonly reasonCodes: readonly string[] };

export type MackLocalValidationEvidenceCreationV1 =
  | { readonly state: "created"; readonly evidence: MackLocalValidationEvidenceV1 }
  | { readonly state: "invalid"; readonly reasonCodes: readonly string[] };

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const REVISION = /^[0-9a-f]{40,64}$/u;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*:)[A-Za-z0-9._/@# +,=-]{1,512}$/u;
const ABSOLUTE_PATH = /^\/(?!.*(?:^|\/)\.\.(?:\/|$))[^\u0000\r\n]{1,4095}$/u;
const ENVIRONMENT_NAME = /^(?:CI|LANG|LC_ALL|NODE_ENV|PATH|TZ)$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const EMPTY_SHA256 = "sha256:47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";

const REQUEST_FIELDS = [
  "schemaVersion", "contractVersion", "seatId", "missionId", "missionRevisionId",
  "subjectId", "repository", "repositoryRoot", "canonicalGitDirectory", "branch", "baseRevisionId",
  "artifactRevisionId", "validationRequestId", "model", "toolExecutorId", "scenarios",
  "lanes", "approvedTestSurfaces", "repositoryContext", "missionArtifacts",
] as const;
const MODEL_FIELDS = ["provider", "baseUrl", "modelKey"] as const;
const SCENARIO_FIELDS = ["scenarioId", "required", "description"] as const;
const LANE_FIELDS = [
  "laneId", "commandId", "executable", "executableSha256", "argv", "workingDirectory",
  "timeoutMs", "environment", "required", "scenarioIds",
] as const;
const ENVIRONMENT_FIELDS = ["name", "value"] as const;
const CONTEXT_FIELDS = ["implementationPaths", "diff", "sources"] as const;
const BYTES_FIELDS = ["contentBase64", "sha256", "truncated"] as const;
const SOURCE_FIELDS = ["path", ...BYTES_FIELDS] as const;
const ARTIFACT_FIELDS = ["artifactId", "path", ...BYTES_FIELDS] as const;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  if (!plain(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) return false;
  const allowed = new Set(fields);
  return keys.every((key) => {
    if (typeof key !== "string" || !allowed.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, "value");
  }) && fields.every((field) => Object.hasOwn(value, field));
}

function dense(value: unknown, max: number): readonly unknown[] | null {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > max) return null;
  const output: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return null;
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor, "value")) return null;
    output.push(descriptor.value);
  }
  if (Reflect.ownKeys(value).some((key) => key !== "length" && (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key)))) return null;
  return output;
}

function data(value: Record<string, unknown>, field: string): unknown {
  return Object.getOwnPropertyDescriptor(value, field)?.value;
}

function validText(value: unknown, max = 512): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value);
}

function validStringArray(value: unknown, validate: (item: unknown) => item is string, max = 128): value is readonly string[] {
  const items = dense(value, max);
  return items !== null && items.every(validate) && new Set(items).size === items.length;
}

function validBase64(value: unknown, maxBytes: number): value is string {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) return false;
  const bytes = Buffer.from(value, "base64");
  return bytes.byteLength <= maxBytes && bytes.toString("base64") === value;
}

function sha256Bytes(base64: string): string {
  return `sha256:${createHash("sha256").update(Buffer.from(base64, "base64")).digest("base64url")}`;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    Object.freeze(value);
  }
  return value;
}

function validFrozenBytes(value: unknown, fields: readonly string[], maxBytes: number): boolean {
  if (!exact(value, fields)) return false;
  const contentBase64 = data(value, "contentBase64");
  return validBase64(contentBase64, maxBytes) && data(value, "truncated") === false && DIGEST.test(String(data(value, "sha256"))) && data(value, "sha256") === sha256Bytes(contentBase64);
}

function normalizeRequest(input: unknown): MackLocalValidationRequestV1 | null {
  if (!exact(input, REQUEST_FIELDS)) return null;
  if (data(input, "schemaVersion") !== 1 || data(input, "contractVersion") !== MACK_LOCAL_VALIDATION_CONTRACT_VERSION || data(input, "seatId") !== "mack") return null;
  for (const field of ["missionId", "missionRevisionId", "subjectId", "branch", "validationRequestId"] as const) {
    if (typeof data(input, field) !== "string" || !IDENTIFIER.test(data(input, field) as string)) return null;
  }
  if (typeof data(input, "repository") !== "string" || !REPOSITORY.test(data(input, "repository") as string)) return null;
  if (typeof data(input, "repositoryRoot") !== "string" || !ABSOLUTE_PATH.test(data(input, "repositoryRoot") as string)) return null;
  if (typeof data(input, "canonicalGitDirectory") !== "string" || !ABSOLUTE_PATH.test(data(input, "canonicalGitDirectory") as string)) return null;
  if (typeof data(input, "baseRevisionId") !== "string" || !REVISION.test(data(input, "baseRevisionId") as string) || typeof data(input, "artifactRevisionId") !== "string" || !REVISION.test(data(input, "artifactRevisionId") as string) || data(input, "baseRevisionId") === data(input, "artifactRevisionId")) return null;
  if (data(input, "toolExecutorId") !== MACK_LOCAL_VALIDATION_EXECUTOR_ID) return null;

  const model = data(input, "model");
  if (!exact(model, MODEL_FIELDS) || data(model, "provider") !== "lmstudio" || !validText(data(model, "baseUrl"), 2048) || !validText(data(model, "modelKey"), 512) || !IDENTIFIER.test(data(model, "modelKey") as string)) return null;

  const scenarioInputs = dense(data(input, "scenarios"), 128);
  if (scenarioInputs === null || scenarioInputs.length === 0) return null;
  const scenarios: MackLocalValidationScenarioV1[] = [];
  for (const scenario of scenarioInputs) {
    if (!exact(scenario, SCENARIO_FIELDS) || typeof data(scenario, "scenarioId") !== "string" || !IDENTIFIER.test(data(scenario, "scenarioId") as string) || typeof data(scenario, "required") !== "boolean" || !validText(data(scenario, "description"), 2048)) return null;
    scenarios.push({ scenarioId: data(scenario, "scenarioId") as string, required: data(scenario, "required") as boolean, description: data(scenario, "description") as string });
  }
  if (new Set(scenarios.map(({ scenarioId }) => scenarioId)).size !== scenarios.length || !scenarios.some(({ required }) => required)) return null;

  const laneInputs = dense(data(input, "lanes"), 128);
  if (laneInputs === null || laneInputs.length === 0) return null;
  const lanes: MackLocalValidationLaneV1[] = [];
  const scenarioIds = new Set(scenarios.map(({ scenarioId }) => scenarioId));
  for (const lane of laneInputs) {
    if (!exact(lane, LANE_FIELDS)) return null;
    const environmentInputs = dense(data(lane, "environment"), 16);
    const argv = data(lane, "argv");
    const mappedScenarios = data(lane, "scenarioIds");
    if (typeof data(lane, "laneId") !== "string" || !IDENTIFIER.test(data(lane, "laneId") as string) || typeof data(lane, "commandId") !== "string" || !IDENTIFIER.test(data(lane, "commandId") as string) || typeof data(lane, "executable") !== "string" || !ABSOLUTE_PATH.test(data(lane, "executable") as string) || typeof data(lane, "executableSha256") !== "string" || !DIGEST.test(data(lane, "executableSha256") as string) || typeof data(lane, "workingDirectory") !== "string" || !ABSOLUTE_PATH.test(data(lane, "workingDirectory") as string) || !Number.isSafeInteger(data(lane, "timeoutMs")) || (data(lane, "timeoutMs") as number) < 100 || (data(lane, "timeoutMs") as number) > 900_000 || typeof data(lane, "required") !== "boolean") return null;
    if (!validStringArray(argv, (item): item is string => typeof item === "string" && Buffer.byteLength(item, "utf8") <= 4096, 128) || !validStringArray(mappedScenarios, (item): item is string => typeof item === "string" && scenarioIds.has(item), 128) || mappedScenarios.length === 0) return null;
    if (environmentInputs === null) return null;
    const environment: MackLocalEnvironmentEntryV1[] = [];
    for (const entry of environmentInputs) {
      if (!exact(entry, ENVIRONMENT_FIELDS) || typeof data(entry, "name") !== "string" || !ENVIRONMENT_NAME.test(data(entry, "name") as string) || typeof data(entry, "value") !== "string" || Buffer.byteLength(data(entry, "value") as string, "utf8") > 4096) return null;
      environment.push({ name: data(entry, "name") as string, value: data(entry, "value") as string });
    }
    if (new Set(environment.map(({ name }) => name)).size !== environment.length || environment.some(({ name }, index) => index > 0 && environment[index - 1].name.localeCompare(name) >= 0)) return null;
    lanes.push({
      laneId: data(lane, "laneId") as string,
      commandId: data(lane, "commandId") as string,
      executable: data(lane, "executable") as string,
      executableSha256: data(lane, "executableSha256") as string,
      argv: [...argv],
      workingDirectory: data(lane, "workingDirectory") as string,
      timeoutMs: data(lane, "timeoutMs") as number,
      environment,
      required: data(lane, "required") as boolean,
      scenarioIds: [...mappedScenarios],
    });
  }
  if (new Set(lanes.map(({ laneId }) => laneId)).size !== lanes.length || new Set(lanes.map(({ commandId }) => commandId)).size !== lanes.length) return null;
  for (const scenario of scenarios.filter(({ required }) => required)) {
    if (!lanes.some((lane) => lane.required && lane.scenarioIds.includes(scenario.scenarioId))) return null;
  }

  const approvedTestSurfaces = data(input, "approvedTestSurfaces");
  if (!validStringArray(approvedTestSurfaces, (item): item is string => typeof item === "string" && SAFE_PATH.test(item), 128)) return null;

  const repositoryContext = data(input, "repositoryContext");
  if (!exact(repositoryContext, CONTEXT_FIELDS)) return null;
  const implementationPaths = data(repositoryContext, "implementationPaths");
  if (!validStringArray(implementationPaths, (item): item is string => typeof item === "string" && SAFE_PATH.test(item), 512) || implementationPaths.length === 0) return null;
  if (!validFrozenBytes(data(repositoryContext, "diff"), BYTES_FIELDS, 4_194_304)) return null;
  const sourceInputs = dense(data(repositoryContext, "sources"), 512);
  if (sourceInputs === null || sourceInputs.length !== implementationPaths.length) return null;
  const sources: MackLocalRepositorySourceV1[] = [];
  let sourceBytes = 0;
  for (let index = 0; index < sourceInputs.length; index += 1) {
    const source = sourceInputs[index];
    if (!validFrozenBytes(source, SOURCE_FIELDS, 2_097_152) || data(source as Record<string, unknown>, "path") !== implementationPaths[index]) return null;
    sourceBytes += Buffer.from(data(source as Record<string, unknown>, "contentBase64") as string, "base64").byteLength;
    if (sourceBytes > 4_194_304) return null;
    sources.push({ path: data(source as Record<string, unknown>, "path") as string, contentBase64: data(source as Record<string, unknown>, "contentBase64") as string, sha256: data(source as Record<string, unknown>, "sha256") as string, truncated: false });
  }

  const artifactInputs = dense(data(input, "missionArtifacts"), 64);
  if (artifactInputs === null || artifactInputs.length === 0) return null;
  const missionArtifacts: MackLocalMissionArtifactV1[] = [];
  let artifactBytes = 0;
  for (const artifact of artifactInputs) {
    if (!validFrozenBytes(artifact, ARTIFACT_FIELDS, 2_097_152) || typeof data(artifact as Record<string, unknown>, "artifactId") !== "string" || !IDENTIFIER.test(data(artifact as Record<string, unknown>, "artifactId") as string) || typeof data(artifact as Record<string, unknown>, "path") !== "string" || !SAFE_PATH.test(data(artifact as Record<string, unknown>, "path") as string)) return null;
    artifactBytes += Buffer.from(data(artifact as Record<string, unknown>, "contentBase64") as string, "base64").byteLength;
    if (artifactBytes > 2_097_152) return null;
    missionArtifacts.push({ artifactId: data(artifact as Record<string, unknown>, "artifactId") as string, path: data(artifact as Record<string, unknown>, "path") as string, contentBase64: data(artifact as Record<string, unknown>, "contentBase64") as string, sha256: data(artifact as Record<string, unknown>, "sha256") as string, truncated: false });
  }
  if (new Set(missionArtifacts.map(({ artifactId }) => artifactId)).size !== missionArtifacts.length || new Set(missionArtifacts.map(({ path }) => path)).size !== missionArtifacts.length) return null;

  return {
    schemaVersion: 1,
    contractVersion: MACK_LOCAL_VALIDATION_CONTRACT_VERSION,
    seatId: "mack",
    missionId: data(input, "missionId") as string,
    missionRevisionId: data(input, "missionRevisionId") as string,
    subjectId: data(input, "subjectId") as string,
    repository: data(input, "repository") as string,
    repositoryRoot: data(input, "repositoryRoot") as string,
    canonicalGitDirectory: data(input, "canonicalGitDirectory") as string,
    branch: data(input, "branch") as string,
    baseRevisionId: data(input, "baseRevisionId") as string,
    artifactRevisionId: data(input, "artifactRevisionId") as string,
    validationRequestId: data(input, "validationRequestId") as string,
    model: { provider: "lmstudio", baseUrl: data(model, "baseUrl") as string, modelKey: data(model, "modelKey") as string },
    toolExecutorId: MACK_LOCAL_VALIDATION_EXECUTOR_ID,
    scenarios,
    lanes,
    approvedTestSurfaces: [...approvedTestSurfaces],
    repositoryContext: { implementationPaths: [...implementationPaths], diff: data(repositoryContext, "diff") as unknown as MackLocalFrozenBytesV1, sources },
    missionArtifacts,
  };
}

export function computeMackLocalValidationRequestDigestV1(request: MackLocalValidationRequestV1): string {
  return `sha256:${createHash("sha256").update(canonicalJson(request), "utf8").digest("base64url")}`;
}

export function normalizeMackLocalValidationRequestV1(input: unknown): MackLocalValidationRequestNormalizationV1 {
  try {
    const value = normalizeRequest(input);
    if (value === null) return { state: "invalid", reasonCodes: Object.freeze(["INVALID_VALIDATION_REQUEST"]) };
    return { state: "valid", value: deepFreeze(value) as MackLocalValidationRequestV1, requestDigest: computeMackLocalValidationRequestDigestV1(value) };
  } catch {
    return { state: "invalid", reasonCodes: Object.freeze(["INVALID_VALIDATION_REQUEST"]) };
  }
}

function same(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function commandOutcome(receipt: MackLocalCommandReceiptV1): MackLaneOutcomeV0 {
  if (receipt.launchError !== null) return "unavailable";
  if (receipt.timedOut) return "environment_blocked";
  if (receipt.stdout.truncated || receipt.stderr.truncated) return "inconclusive";
  if (receipt.signal !== null || receipt.exitCode !== 0) return "fail";
  if (receipt.exitCode === null) return "inconclusive";
  return "pass";
}

function validAnalysis(request: MackLocalValidationRequestV1, analysis: MackLocalModelAnalysisV1): boolean {
  if (!exact(analysis, ["scenarioAssessments", "findings", "limitations", "recommendedRoute"])) return false;
  const assessments = dense(analysis.scenarioAssessments, 128);
  const findings = dense(analysis.findings, 128);
  const limitations = dense(analysis.limitations, 64);
  if (assessments === null || assessments.length !== request.scenarios.length || findings === null || limitations === null) return false;
  for (let index = 0; index < assessments.length; index += 1) {
    const assessment = assessments[index];
    if (!exact(assessment, ["scenarioId", "assessment", "summary"]) || data(assessment, "scenarioId") !== request.scenarios[index].scenarioId || !MACK_LOCAL_MODEL_ASSESSMENTS.includes(data(assessment, "assessment") as MackLocalModelAssessmentV1) || !validText(data(assessment, "summary"), 2048)) return false;
  }
  const findingIds = new Set<string>();
  const routeByClass: Record<MackFindingClassV0, readonly MackRouteV0[]> = {
    production_defect: ["may"],
    test_defect: ["mack"],
    environment_limitation: ["daisy"],
    coverage_gap: ["mack"],
    advisory_gap: ["daisy", "fury"],
  };
  for (const finding of findings) {
    if (!exact(finding, ["findingId", "classification", "route"]) || typeof data(finding, "findingId") !== "string" || !IDENTIFIER.test(data(finding, "findingId") as string) || findingIds.has(data(finding, "findingId") as string)) return false;
    const classification = data(finding, "classification") as MackFindingClassV0;
    const route = data(finding, "route") as MackRouteV0;
    if (!Object.hasOwn(routeByClass, classification) || !routeByClass[classification].includes(route)) return false;
    findingIds.add(data(finding, "findingId") as string);
  }
  if (!limitations.every((item) => validText(item, 512)) || new Set(limitations).size !== limitations.length) return false;
  return ["advance", "may", "mack", "daisy", "fury"].includes(analysis.recommendedRoute);
}

function validReceipt(lane: MackLocalValidationLaneV1, receipt: MackLocalCommandReceiptV1): boolean {
  if (!exact(receipt, ["laneId", "commandId", "executable", "executableSha256", "argv", "workingDirectory", "environment", "startedAt", "endedAt", "exitCode", "signal", "timedOut", "launchError", "stdout", "stderr"])) return false;
  if (receipt.laneId !== lane.laneId || receipt.commandId !== lane.commandId || receipt.executable !== lane.executable || receipt.executableSha256 !== lane.executableSha256 || receipt.workingDirectory !== lane.workingDirectory || !same(receipt.argv, lane.argv) || !same(receipt.environment, lane.environment)) return false;
  if (!ISO_TIMESTAMP.test(receipt.startedAt) || !ISO_TIMESTAMP.test(receipt.endedAt) || Date.parse(receipt.endedAt) < Date.parse(receipt.startedAt)) return false;
  if (!(receipt.exitCode === null || (Number.isSafeInteger(receipt.exitCode) && receipt.exitCode >= 0 && receipt.exitCode <= 255)) || !(receipt.signal === null || (typeof receipt.signal === "string" && /^SIG[A-Z0-9]+$/u.test(receipt.signal))) || typeof receipt.timedOut !== "boolean" || !(receipt.launchError === null || /^[a-z][a-z0-9_]{0,127}$/u.test(receipt.launchError))) return false;
  for (const output of [receipt.stdout, receipt.stderr]) {
    if (!exact(output, ["sha256", "bytes", "truncated"]) || !DIGEST.test(output.sha256) || !Number.isSafeInteger(output.bytes) || output.bytes < 0 || output.bytes > 262_144 || typeof output.truncated !== "boolean") return false;
  }
  return true;
}

function validObservation(request: MackLocalValidationRequestV1, observation: MackLocalGitObservationV1): boolean {
  return exact(observation, ["repository", "canonicalRepositoryRoot", "canonicalTopLevel", "canonicalGitDirectory", "branch", "headRevisionId", "statusPorcelainBytes", "statusPorcelainSha256", "changedPaths"]) &&
    observation.repository.toLowerCase() === request.repository.toLowerCase() && observation.canonicalRepositoryRoot === request.repositoryRoot && observation.canonicalTopLevel === request.repositoryRoot && observation.canonicalGitDirectory === request.canonicalGitDirectory && observation.branch === request.branch && observation.headRevisionId === request.artifactRevisionId && observation.statusPorcelainBytes === 0 && observation.statusPorcelainSha256 === EMPTY_SHA256 && same(observation.changedPaths, request.repositoryContext.implementationPaths);
}

function validRuntime(request: MackLocalValidationRequestV1, observation: MackLocalRuntimeObservationV1): boolean {
  return exact(observation, ["provider", "origin", "observedModelKey", "loadedInstanceId"]) && observation.provider === "lmstudio" && observation.observedModelKey === request.model.modelKey && IDENTIFIER.test(observation.loadedInstanceId) && observation.loadedInstanceId !== request.toolExecutorId && validText(observation.origin, 2048);
}

function deriveStatusAndRoute(reportLanes: MackValidationReportV0["lanes"], analysis: MackLocalModelAnalysisV1): { status: MackValidationReportV0["status"]; route: MackRouteV0; reasons: string[] } {
  const reasons: string[] = [];
  if (reportLanes.some(({ outcome }) => outcome !== "pass")) reasons.push("HOST_LANE_NOT_PASSING");
  if (analysis.scenarioAssessments.some(({ assessment }) => assessment === "failed")) reasons.push("MODEL_SCENARIO_FAILED");
  if (analysis.scenarioAssessments.some(({ assessment }) => assessment === "uncertain")) reasons.push("MODEL_SCENARIO_UNCERTAIN");
  if (analysis.findings.some(({ classification }) => ["production_defect", "test_defect", "coverage_gap"].includes(classification))) reasons.push("MODEL_BLOCKING_FINDING");
  if (analysis.findings.some(({ classification }) => classification === "environment_limitation") || analysis.limitations.length > 0) reasons.push("MODEL_LIMITATION");
  if (analysis.findings.some(({ route }) => route === "fury")) reasons.push("ARCHITECTURE_REVIEW_REQUIRED");
  if (reasons.length === 0) return { status: "pass", route: "advance", reasons };
  if (analysis.findings.some(({ classification }) => classification === "production_defect")) return { status: "fail", route: "may", reasons };
  if (analysis.findings.some(({ classification }) => classification === "test_defect" || classification === "coverage_gap")) return { status: "fail", route: "mack", reasons };
  if (analysis.findings.some(({ route }) => route === "fury")) return { status: "inconclusive", route: "fury", reasons };
  if (analysis.findings.some(({ classification }) => classification === "environment_limitation") || analysis.limitations.length > 0 || analysis.scenarioAssessments.some(({ assessment }) => assessment === "uncertain")) return { status: "inconclusive", route: "daisy", reasons };
  if (analysis.scenarioAssessments.some(({ assessment }) => assessment === "failed")) return { status: "fail", route: "may", reasons };
  return { status: reportLanes.some(({ outcome }) => outcome === "fail") ? "fail" : "inconclusive", route: reportLanes.some(({ outcome }) => outcome === "fail") ? "mack" : "daisy", reasons };
}

function createEvidence(input: MackLocalEvidenceCreationInputV1): MackLocalValidationEvidenceCreationV1 {
  const normalized = normalizeMackLocalValidationRequestV1(input.request);
  if (normalized.state !== "valid" || input.requestDigest !== normalized.requestDigest) return { state: "invalid", reasonCodes: Object.freeze(["REQUEST_DIGEST_MISMATCH"]) };
  const request = normalized.value;
  if (!validObservation(request, input.preInferenceGit) || !validObservation(request, input.postInferenceGit) || !same(input.preInferenceGit, input.postInferenceGit)) return { state: "invalid", reasonCodes: Object.freeze(["GIT_IDENTITY_MISMATCH"]) };
  if (!validRuntime(request, input.preInferenceRuntime) || !validRuntime(request, input.postInferenceRuntime) || !same(input.preInferenceRuntime, input.postInferenceRuntime)) return { state: "invalid", reasonCodes: Object.freeze(["RUNTIME_IDENTITY_MISMATCH"]) };
  const receipts = dense(input.commandReceipts, 128);
  if (receipts === null || receipts.length !== request.lanes.length || receipts.some((receipt, index) => !validReceipt(request.lanes[index], receipt as MackLocalCommandReceiptV1))) return { state: "invalid", reasonCodes: Object.freeze(["COMMAND_RECEIPT_MISMATCH"]) };
  if (input.repositoryContextVerified !== true || input.missionArtifactsVerified !== true) return { state: "invalid", reasonCodes: Object.freeze(["CONTEXT_NOT_VERIFIED"]) };
  if (!DIGEST.test(input.promptSha256) || !DIGEST.test(input.responseSha256) || !validAnalysis(request, input.modelAnalysis)) return { state: "invalid", reasonCodes: Object.freeze(["MODEL_ANALYSIS_INVALID"]) };
  if (!exact(input.providerCounters, ["inputTokens", "outputTokens", "totalTokens"]) || ![input.providerCounters.inputTokens, input.providerCounters.outputTokens, input.providerCounters.totalTokens].every((value) => value === null || (Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000))) return { state: "invalid", reasonCodes: Object.freeze(["PROVIDER_COUNTERS_INVALID"]) };
  const laneOutcomes = request.lanes.map((lane, index) => ({ laneId: lane.laneId, commandId: lane.commandId, outcome: commandOutcome(receipts[index] as MackLocalCommandReceiptV1) }));
  const scenarios = request.scenarios.map((scenario, scenarioIndex) => {
    const requiredMappedOutcomes = request.lanes.map((lane, index) => ({ lane, outcome: laneOutcomes[index].outcome })).filter(({ lane }) => lane.required && lane.scenarioIds.includes(scenario.scenarioId));
    const modelSatisfied = input.modelAnalysis.scenarioAssessments[scenarioIndex]?.assessment === "satisfied";
    return { scenarioId: scenario.scenarioId, required: scenario.required, covered: requiredMappedOutcomes.length > 0 && requiredMappedOutcomes.every(({ outcome }) => outcome === "pass") && modelSatisfied };
  });
  const derived = deriveStatusAndRoute(laneOutcomes, input.modelAnalysis);
  const evidenceRefs = [
    `evidence:mack-local:${request.validationRequestId}:git-pre`,
    `evidence:mack-local:${request.validationRequestId}:git-post`,
    `evidence:mack-local:${request.validationRequestId}:runtime-pre`,
    `evidence:mack-local:${request.validationRequestId}:runtime-post`,
    `evidence:mack-local:${request.validationRequestId}:repository-context`,
    ...request.lanes.map(({ commandId }) => `evidence:mack-local:${request.validationRequestId}:command:${commandId}`),
  ];
  const report: MackValidationReportV0 = {
    schemaVersion: 1,
    contractVersion: "mack.validation.v0",
    assuranceKind: "host_asserted_non_authoritative",
    missionId: request.missionId,
    subjectId: request.subjectId,
    repository: request.repository,
    branch: request.branch,
    artifactRevisionId: request.artifactRevisionId,
    status: derived.status,
    scenarios,
    lanes: laneOutcomes,
    findings: input.modelAnalysis.findings,
    evidenceRefs,
    limitations: input.modelAnalysis.limitations,
    editedTestSurfaces: [],
    recommendedRoute: derived.route,
  };
  if (!same(report.scenarios.map(({ scenarioId, required }) => ({ scenarioId, required })), request.scenarios.map(({ scenarioId, required }) => ({ scenarioId, required }))) || !same(report.lanes.map(({ laneId, commandId }) => ({ laneId, commandId })), request.lanes.map(({ laneId, commandId }) => ({ laneId, commandId })))) return { state: "invalid", reasonCodes: Object.freeze(["FROZEN_PLAN_ORDER_MISMATCH"]) };
  const expected: MackExpectedBindingV0 = { missionId: request.missionId, subjectId: request.subjectId, repository: request.repository, branch: request.branch, artifactRevisionId: request.artifactRevisionId, approvedTestSurfaces: request.approvedTestSurfaces };
  const evaluation = evaluateMackValidationV0(report, expected);
  const reasonCodes = [...derived.reasons, "SYNTHETIC_EVIDENCE", ...evaluation.reasonCodes];
  const withoutDigest = {
    evidenceSchemaVersion: 1 as const,
    contractVersion: MACK_LOCAL_VALIDATION_CONTRACT_VERSION,
    authority: "non_authoritative" as const,
    validationRequestId: request.validationRequestId,
    requestDigest: normalized.requestDigest,
    seatId: "mack" as const,
    missionId: request.missionId,
    missionRevisionId: request.missionRevisionId,
    subjectId: request.subjectId,
    repository: request.repository,
    repositoryRoot: request.repositoryRoot,
    canonicalGitDirectory: request.canonicalGitDirectory,
    branch: request.branch,
    baseRevisionId: request.baseRevisionId,
    artifactRevisionId: request.artifactRevisionId,
    implementationPaths: request.repositoryContext.implementationPaths,
    reasoningRuntimeId: input.preInferenceRuntime.loadedInstanceId,
    reasoningModel: input.preInferenceRuntime.observedModelKey,
    provider: "lmstudio" as const,
    providerOrigin: input.preInferenceRuntime.origin,
    toolExecutorId: MACK_LOCAL_VALIDATION_EXECUTOR_ID,
    preInferenceGit: input.preInferenceGit,
    postInferenceGit: input.postInferenceGit,
    preInferenceRuntime: input.preInferenceRuntime,
    postInferenceRuntime: input.postInferenceRuntime,
    commandReceipts: receipts as readonly MackLocalCommandReceiptV1[],
    repositoryContextVerified: true,
    missionArtifactsVerified: true,
    promptSha256: input.promptSha256,
    responseSha256: input.responseSha256,
    providerCounters: input.providerCounters,
    modelAnalysis: input.modelAnalysis,
    report,
    evaluation,
    evidenceSource: "synthetic" as const,
    productionEligibility: "ineligible" as const,
    advancementEligibility: "ineligible" as const,
    reasonCodes: Object.freeze([...new Set(reasonCodes)]),
  };
  const evidenceDigest = `sha256:${createHash("sha256").update(canonicalJson(withoutDigest), "utf8").digest("base64url")}`;
  return { state: "created", evidence: deepFreeze({ ...withoutDigest, evidenceDigest }) as MackLocalValidationEvidenceV1 };
}

export function createMackLocalValidationEvidenceV1(input: MackLocalEvidenceCreationInputV1): MackLocalValidationEvidenceCreationV1 {
  try {
    return createEvidence(input);
  } catch {
    return { state: "invalid", reasonCodes: Object.freeze(["INVALID_EVIDENCE_INPUT"]) };
  }
}
