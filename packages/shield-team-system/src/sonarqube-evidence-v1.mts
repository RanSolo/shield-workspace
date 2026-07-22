export const SONARQUBE_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const SONARQUBE_EVIDENCE_CONTRACT_VERSION = "sonarqube.evidence.v1" as const;
export const SONARQUBE_FINDING_CLASSES = [
  "blocking",
  "actionable",
  "advisory",
  "false_positive",
  "uncertain",
  "architecture_conformance",
] as const;
export const SONARQUBE_ROUTE_SEATS = ["hill", "daisy", "may", "fury", "coulson"] as const;
export const SONARQUBE_SEVERITIES = ["BLOCKER", "CRITICAL", "MAJOR", "MINOR", "INFO"] as const;
export const SONARQUBE_EXCEPTION_DISPOSITIONS = ["accepted_false_positive", "accepted_risk"] as const;
export const SONARQUBE_REASON_CODES = [
  "INVALID_EXPECTED_BINDING",
  "EVIDENCE_REQUIRED",
  "INVALID_EVIDENCE",
  "EVIDENCE_BINDING_MISMATCH",
  "BLOCKING_FINDINGS",
  "UNCERTAIN_FINDINGS",
  "ARCHITECTURE_FINDINGS_REQUIRE_FURY",
  "EXCEPTION_RATIONALE_REQUIRED",
] as const;

export type SonarQubeFindingClass = (typeof SONARQUBE_FINDING_CLASSES)[number];
export type SonarQubeRouteSeat = (typeof SONARQUBE_ROUTE_SEATS)[number];
export type SonarQubeSeverity = (typeof SONARQUBE_SEVERITIES)[number];
export type SonarQubeExceptionDisposition = (typeof SONARQUBE_EXCEPTION_DISPOSITIONS)[number];
export type SonarQubeReasonCode = (typeof SONARQUBE_REASON_CODES)[number];

export interface SonarQubeExpectedBindingV1 {
  schemaVersion: 1;
  missionId: string;
  subjectId: string;
  repository: string;
  branch: string;
  prNumber: number | null;
  artifactRevisionId: string;
}

export interface SonarQubeFindingV1 {
  findingId: string;
  ruleId: string;
  severity: SonarQubeSeverity;
  classification: SonarQubeFindingClass;
  sourceRef: string;
  componentPath: string;
  line: number | null;
  message: string;
}

export interface SonarQubeAcceptedExceptionV1 {
  findingId: string;
  disposition: SonarQubeExceptionDisposition;
  rationale: string;
  accountableSeatId: SonarQubeRouteSeat;
}

export interface SonarQubeEvidenceV1 {
  schemaVersion: 1;
  contractVersion: "sonarqube.evidence.v1";
  assuranceKind: "host_asserted_non_authoritative";
  evidenceId: string;
  missionId: string;
  subjectId: string;
  repository: string;
  branch: string;
  prNumber: number | null;
  artifactRevisionId: string;
  capturedAt: string;
  scannerSourceRef: string;
  findings: readonly SonarQubeFindingV1[];
  acceptedExceptions: readonly SonarQubeAcceptedExceptionV1[];
}

export interface SonarQubeFindingDispositionV1 extends SonarQubeFindingV1 {
  routeToSeatId: SonarQubeRouteSeat;
  blocksAdvancement: boolean;
  exception: SonarQubeAcceptedExceptionV1 | null;
}

export type SonarQubeEvidenceEvaluationV1 =
  | {
      state: "evaluated";
      schemaVersion: 1;
      contractVersion: "sonarqube.evidence.v1";
      authority: "non_authoritative";
      advancementEligibility: "eligible" | "ineligible";
      reasonCodes: readonly SonarQubeReasonCode[];
      binding: Readonly<SonarQubeExpectedBindingV1>;
      findings: readonly SonarQubeFindingDispositionV1[];
    }
  | {
      state: "invalid";
      schemaVersion: 1;
      authority: "non_authoritative";
      advancementEligibility: "ineligible";
      reasonCodes: readonly SonarQubeReasonCode[];
    };

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/;
const IMMUTABLE_REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{40,64})$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/@# +:=,-]+$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value: unknown, fields: readonly string[], label: string): string[] {
  if (!plain(value)) return [`${label} must be a plain object.`];
  const allowed = new Set(fields);
  const errors: string[] = [];
  for (const field of fields) if (!Object.hasOwn(value, field)) errors.push(`${label} is missing field: ${field}.`);
  for (const field of Object.keys(value)) if (!allowed.has(field)) errors.push(`${label} has unknown field: ${field}.`);
  return errors;
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function boundedText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 1000;
}

function validBinding(input: unknown): input is SonarQubeExpectedBindingV1 {
  if (exact(input, ["schemaVersion", "missionId", "subjectId", "repository", "branch", "prNumber", "artifactRevisionId"], "SonarQube expected binding").length > 0 || !plain(input)) return false;
  return input.schemaVersion === 1 &&
    identifier(input.missionId) &&
    identifier(input.subjectId) &&
    typeof input.repository === "string" && REPOSITORY.test(input.repository) &&
    identifier(input.branch) &&
    (input.prNumber === null || (typeof input.prNumber === "number" && Number.isInteger(input.prNumber) && input.prNumber > 0)) &&
    typeof input.artifactRevisionId === "string" && IMMUTABLE_REVISION.test(input.artifactRevisionId);
}

function routeFor(classification: SonarQubeFindingClass): SonarQubeRouteSeat {
  if (classification === "blocking" || classification === "actionable") return "may";
  if (classification === "uncertain") return "daisy";
  if (classification === "architecture_conformance") return "fury";
  return "hill";
}

function validateFinding(input: unknown): input is SonarQubeFindingV1 {
  if (exact(input, ["findingId", "ruleId", "severity", "classification", "sourceRef", "componentPath", "line", "message"], "SonarQube finding").length > 0 || !plain(input)) return false;
  return identifier(input.findingId) &&
    identifier(input.ruleId) &&
    SONARQUBE_SEVERITIES.includes(input.severity as SonarQubeSeverity) &&
    SONARQUBE_FINDING_CLASSES.includes(input.classification as SonarQubeFindingClass) &&
    identifier(input.sourceRef) &&
    typeof input.componentPath === "string" && SAFE_PATH.test(input.componentPath) &&
    (input.line === null || (typeof input.line === "number" && Number.isInteger(input.line) && input.line > 0)) &&
    boundedText(input.message);
}

function validateException(input: unknown): input is SonarQubeAcceptedExceptionV1 {
  if (exact(input, ["findingId", "disposition", "rationale", "accountableSeatId"], "SonarQube accepted exception").length > 0 || !plain(input)) return false;
  return identifier(input.findingId) &&
    SONARQUBE_EXCEPTION_DISPOSITIONS.includes(input.disposition as SonarQubeExceptionDisposition) &&
    boundedText(input.rationale) &&
    SONARQUBE_ROUTE_SEATS.includes(input.accountableSeatId as SonarQubeRouteSeat);
}

function validEvidence(input: unknown): input is SonarQubeEvidenceV1 {
  if (exact(input, ["schemaVersion", "contractVersion", "assuranceKind", "evidenceId", "missionId", "subjectId", "repository", "branch", "prNumber", "artifactRevisionId", "capturedAt", "scannerSourceRef", "findings", "acceptedExceptions"], "SonarQube evidence").length > 0 || !plain(input)) return false;
  if (input.schemaVersion !== 1 || input.contractVersion !== SONARQUBE_EVIDENCE_CONTRACT_VERSION || input.assuranceKind !== "host_asserted_non_authoritative") return false;
  if (!identifier(input.evidenceId) || !identifier(input.missionId) || !identifier(input.subjectId) || !identifier(input.branch) || !identifier(input.scannerSourceRef)) return false;
  if (typeof input.repository !== "string" || !REPOSITORY.test(input.repository)) return false;
  if (input.prNumber !== null && (typeof input.prNumber !== "number" || !Number.isInteger(input.prNumber) || input.prNumber < 1)) return false;
  if (typeof input.artifactRevisionId !== "string" || !IMMUTABLE_REVISION.test(input.artifactRevisionId)) return false;
  if (typeof input.capturedAt !== "string" || !ISO_UTC.test(input.capturedAt) || !Number.isFinite(Date.parse(input.capturedAt))) return false;
  if (!Array.isArray(input.findings) || input.findings.length > 128 || !Array.isArray(input.acceptedExceptions) || input.acceptedExceptions.length > 128) return false;
  return input.findings.every(validateFinding) && input.acceptedExceptions.every(validateException);
}

export function evaluateSonarQubeEvidenceV1(evidenceInput: unknown, expectedInput: unknown): SonarQubeEvidenceEvaluationV1 {
  if (!validBinding(expectedInput)) {
    return {
      state: "invalid",
      schemaVersion: SONARQUBE_EVIDENCE_SCHEMA_VERSION,
      authority: "non_authoritative",
      advancementEligibility: "ineligible",
      reasonCodes: ["INVALID_EXPECTED_BINDING"],
    };
  }
  if (!validEvidence(evidenceInput)) {
    return {
      state: "invalid",
      schemaVersion: SONARQUBE_EVIDENCE_SCHEMA_VERSION,
      authority: "non_authoritative",
      advancementEligibility: "ineligible",
      reasonCodes: ["EVIDENCE_REQUIRED"],
    };
  }
  const evidence = evidenceInput;
  const expected = expectedInput;
  const bindingMatches = evidence.missionId === expected.missionId &&
    evidence.subjectId === expected.subjectId &&
    evidence.repository === expected.repository &&
    evidence.branch === expected.branch &&
    evidence.prNumber === expected.prNumber &&
    evidence.artifactRevisionId === expected.artifactRevisionId;
  if (!bindingMatches) {
    return {
      state: "invalid",
      schemaVersion: SONARQUBE_EVIDENCE_SCHEMA_VERSION,
      authority: "non_authoritative",
      advancementEligibility: "ineligible",
      reasonCodes: ["EVIDENCE_BINDING_MISMATCH"],
    };
  }

  const reasonCodes: SonarQubeReasonCode[] = [];
  const exceptionByFinding = new Map<string, SonarQubeAcceptedExceptionV1>();
  for (const exception of evidence.acceptedExceptions) {
    if (exceptionByFinding.has(exception.findingId)) reasonCodes.push("EXCEPTION_RATIONALE_REQUIRED");
    exceptionByFinding.set(exception.findingId, exception);
  }

  const findingIds = new Set<string>();
  const sourceRefs = new Set<string>();
  const dispositions: SonarQubeFindingDispositionV1[] = [];
  for (const finding of evidence.findings) {
    if (findingIds.has(finding.findingId) || sourceRefs.has(finding.sourceRef)) reasonCodes.push("INVALID_EVIDENCE");
    findingIds.add(finding.findingId);
    sourceRefs.add(finding.sourceRef);
    const exception = exceptionByFinding.get(finding.findingId) ?? null;
    if (finding.classification === "false_positive" && exception === null) reasonCodes.push("EXCEPTION_RATIONALE_REQUIRED");
    if (exception !== null && finding.classification !== "false_positive" && exception.disposition === "accepted_false_positive") reasonCodes.push("EXCEPTION_RATIONALE_REQUIRED");
    const blocksByClass = finding.classification === "blocking" ||
      finding.classification === "actionable" ||
      finding.classification === "uncertain" ||
      finding.classification === "architecture_conformance";
    const blocksAdvancement = blocksByClass && exception === null;
    if (blocksAdvancement && (finding.classification === "blocking" || finding.classification === "actionable")) reasonCodes.push("BLOCKING_FINDINGS");
    if (blocksAdvancement && finding.classification === "uncertain") reasonCodes.push("UNCERTAIN_FINDINGS");
    if (blocksAdvancement && finding.classification === "architecture_conformance") reasonCodes.push("ARCHITECTURE_FINDINGS_REQUIRE_FURY");
    dispositions.push({
      ...finding,
      routeToSeatId: routeFor(finding.classification),
      blocksAdvancement,
      exception,
    });
  }
  for (const exception of evidence.acceptedExceptions) {
    if (!findingIds.has(exception.findingId)) reasonCodes.push("EXCEPTION_RATIONALE_REQUIRED");
  }

  const uniqueReasons = SONARQUBE_REASON_CODES.filter((reason) => reasonCodes.includes(reason));
  return {
    state: "evaluated",
    schemaVersion: SONARQUBE_EVIDENCE_SCHEMA_VERSION,
    contractVersion: SONARQUBE_EVIDENCE_CONTRACT_VERSION,
    authority: "non_authoritative",
    advancementEligibility: uniqueReasons.length === 0 ? "eligible" : "ineligible",
    reasonCodes: uniqueReasons,
    binding: expected,
    findings: dispositions,
  };
}
