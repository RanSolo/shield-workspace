export const FURY_PLAN_GATE_SCHEMA_VERSION = 1;
export const FURY_PLAN_GATE_CONTRACT_VERSION = "fury.plan-gate.v1";
export const FURY_PLAN_GATE_MAX_FINDINGS = 16;

export const FURY_PLAN_GATE_VERDICTS = Object.freeze([
  "PASS", "PASS_WITH_REQUIRED_CHANGES", "FAIL",
]);
export const FURY_PLAN_GATE_FINDING_CLASSES = Object.freeze([
  "architecture",
  "authority",
  "compatibility",
  "replay_safety",
  "fail_closedness",
  "implementation_boundary",
  "validation_readiness",
  "operational_completeness",
]);
export const FURY_PLAN_GATE_REASON_CODES = Object.freeze([
  "INVALID_EXPECTED_BINDING",
  "PLAN_REVIEW_REQUIRED",
  "INVALID_PLAN_REVIEW",
  "REPLAY_BINDING_MISMATCH",
  "REVIEW_REVISION_STALE",
  "REVIEW_FAILED",
  "RECONCILIATION_REQUIRED",
  "INVALID_RECONCILIATION",
  "RECONCILIATION_BINDING_MISMATCH",
  "CORRECTED_REVISION_NOT_DISTINCT",
  "ADDITIONAL_ARCHITECTURE_CHANGE_REVIEW_REQUIRED",
  "REQUIRED_CHANGE_SET_MISMATCH",
  "RECONCILIATION_REVISION_STALE",
]);

const ASSURANCE = "host_asserted_non_authoritative";
const SEAT_IDS = Object.freeze([
  "coulson", "hill", "daisy", "may", "fury", "fitz", "simmons",
]);
const IDENTIFIER = /^[A-Za-z0-9](?:[A-Za-z0-9._:/#@-]{0,126}[A-Za-z0-9])?$/;
const EVIDENCE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$/;
const REVISION = /^[0-9a-f]{40,64}$/;
const MAX_TOTAL_REFS = 64;

const ENVELOPE_FIELDS = Object.freeze([
  "planGateSchemaVersion", "contractVersion", "review", "reconciliation",
]);
const REVIEW_FIELDS = Object.freeze([
  "reviewSchemaVersion", "contractVersion", "assuranceKind", "reviewId", "missionId",
  "subjectId", "repositoryOwner", "repositoryName", "baseBranch", "missionBranch",
  "prNumber", "blueprintArtifactId", "blueprintArtifactPath", "blueprintArtifactKind",
  "blueprintOwningSeatId", "reviewedRevisionId", "verdict", "findings",
  "reasoningRuntimeId", "toolExecutorId",
]);
const FINDING_FIELDS = Object.freeze(["findingId", "findingClass", "evidenceRefs"]);
const RECONCILIATION_FIELDS = Object.freeze([
  "reconciliationSchemaVersion", "contractVersion", "assuranceKind", "reconciliationId",
  "reviewId", "missionId", "subjectId", "repositoryOwner", "repositoryName", "baseBranch",
  "missionBranch", "prNumber", "blueprintArtifactId", "blueprintArtifactPath",
  "blueprintArtifactKind", "blueprintOwningSeatId", "reviewedRevisionId",
  "correctedRevisionId", "additionalArchitectureChange", "dispositions",
  "reasoningRuntimeId", "toolExecutorId",
]);
const DISPOSITION_FIELDS = Object.freeze(["findingId", "disposition", "evidenceRefs"]);
const EXPECTED_FIELDS = Object.freeze([
  "schemaVersion", "assuranceKind", "missionId", "subjectId", "repositoryOwner",
  "repositoryName", "baseBranch", "missionBranch", "prNumber", "blueprintArtifactId",
  "blueprintArtifactPath", "blueprintArtifactKind", "blueprintOwningSeatId",
  "currentBlueprintRevisionId",
]);
const CONTEXT_FIELDS = Object.freeze([
  "missionId", "subjectId", "repositoryOwner", "repositoryName", "baseBranch",
  "missionBranch", "prNumber", "blueprintArtifactId", "blueprintArtifactPath",
  "blueprintArtifactKind", "blueprintOwningSeatId",
]);

const invalidResult = (reason) => Object.freeze({
  state: "invalid",
  planGateSchemaVersion: 1,
  authority: "non_authoritative",
  dispatchEligibility: "ineligible",
  reasonCodes: Object.freeze([reason]),
});

function dataRecord(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  if (Object.getPrototypeOf(value) !== Object.prototype) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string") ||
      fields.some((field) => !keys.includes(field)) || keys.some((key) => !fields.includes(key))) {
    return null;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const result = {};
  for (const field of fields) {
    const descriptor = descriptors[field];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) return null;
    result[field] = descriptor.value;
  }
  return result;
}

function denseDataArray(value, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximum) return null;
  const expectedKeys = Array.from({ length }, (_, index) => String(index));
  const keys = Reflect.ownKeys(value);
  if (keys.length !== length + 1 || !keys.includes("length") ||
      expectedKeys.some((key) => !keys.includes(key))) return null;
  const result = [];
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (!descriptor || !("value" in descriptor) || descriptor.get || descriptor.set) return null;
    result.push(descriptor.value);
  }
  return result;
}

function identifier(value) {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") <= 128 &&
    IDENTIFIER.test(value);
}

function evidenceReference(value) {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") <= 256 &&
    EVIDENCE_REFERENCE.test(value);
}

export function isFuryPlanGateArtifactPath(value) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 512 ||
      value.length === 0 || value.startsWith("/") || value.includes("\\") ||
      value.includes("%") || /[\u0000-\u001f\u007f]/.test(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function assertedIdentity(value) {
  return value === null || (identifier(value) && !SEAT_IDS.includes(value.toLowerCase()));
}

function validAttribution(record) {
  return assertedIdentity(record.reasoningRuntimeId) && assertedIdentity(record.toolExecutorId) &&
    (record.reasoningRuntimeId === null || record.reasoningRuntimeId !== record.toolExecutorId);
}

function normalizeRefs(input, counter) {
  const refs = denseDataArray(input, 8);
  if (refs === null || refs.length === 0 || refs.some((ref) => !evidenceReference(ref)) ||
      new Set(refs).size !== refs.length) return null;
  counter.count += refs.length;
  if (counter.count > MAX_TOTAL_REFS) return null;
  return Object.freeze([...refs]);
}

function normalizeReview(input, counter) {
  const review = dataRecord(input, REVIEW_FIELDS);
  if (review === null || review.reviewSchemaVersion !== 1 ||
      review.contractVersion !== FURY_PLAN_GATE_CONTRACT_VERSION ||
      review.assuranceKind !== ASSURANCE || !FURY_PLAN_GATE_VERDICTS.includes(review.verdict) ||
      review.blueprintArtifactKind !== "implementation_blueprint" ||
      review.blueprintOwningSeatId !== "may" || !validAttribution(review)) return null;
  for (const field of [
    "reviewId", "missionId", "subjectId", "repositoryOwner", "repositoryName", "baseBranch",
    "missionBranch", "blueprintArtifactId",
  ]) if (!identifier(review[field])) return null;
  if (!isFuryPlanGateArtifactPath(review.blueprintArtifactPath) ||
      !Number.isSafeInteger(review.prNumber) || review.prNumber < 1 || review.prNumber > 2_147_483_647 ||
      !REVISION.test(review.reviewedRevisionId)) return null;
  const findings = denseDataArray(review.findings, FURY_PLAN_GATE_MAX_FINDINGS);
  if (findings === null) return null;
  if ((review.verdict === "PASS" && findings.length !== 0) ||
      (review.verdict !== "PASS" && findings.length === 0)) return null;
  const normalizedFindings = [];
  const ids = new Set();
  for (const inputFinding of findings) {
    const finding = dataRecord(inputFinding, FINDING_FIELDS);
    if (finding === null || !identifier(finding.findingId) || ids.has(finding.findingId) ||
        !FURY_PLAN_GATE_FINDING_CLASSES.includes(finding.findingClass)) return null;
    const evidenceRefs = normalizeRefs(finding.evidenceRefs, counter);
    if (evidenceRefs === null) return null;
    ids.add(finding.findingId);
    normalizedFindings.push(Object.freeze({ ...finding, evidenceRefs }));
  }
  return Object.freeze({ ...review, findings: Object.freeze(normalizedFindings) });
}

function normalizeReconciliation(input, counter) {
  const reconciliation = dataRecord(input, RECONCILIATION_FIELDS);
  if (reconciliation === null || reconciliation.reconciliationSchemaVersion !== 1 ||
      reconciliation.contractVersion !== FURY_PLAN_GATE_CONTRACT_VERSION ||
      reconciliation.assuranceKind !== ASSURANCE ||
      typeof reconciliation.additionalArchitectureChange !== "boolean" ||
      reconciliation.blueprintArtifactKind !== "implementation_blueprint" ||
      reconciliation.blueprintOwningSeatId !== "may" || !validAttribution(reconciliation)) return null;
  for (const field of [
    "reconciliationId", "reviewId", "missionId", "subjectId", "repositoryOwner",
    "repositoryName", "baseBranch", "missionBranch", "blueprintArtifactId",
  ]) if (!identifier(reconciliation[field])) return null;
  if (!isFuryPlanGateArtifactPath(reconciliation.blueprintArtifactPath) ||
      !Number.isSafeInteger(reconciliation.prNumber) || reconciliation.prNumber < 1 ||
      reconciliation.prNumber > 2_147_483_647 || !REVISION.test(reconciliation.reviewedRevisionId) ||
      !REVISION.test(reconciliation.correctedRevisionId)) return null;
  const dispositions = denseDataArray(reconciliation.dispositions, FURY_PLAN_GATE_MAX_FINDINGS);
  if (dispositions === null) return null;
  const normalizedDispositions = [];
  const ids = new Set();
  for (const inputDisposition of dispositions) {
    const disposition = dataRecord(inputDisposition, DISPOSITION_FIELDS);
    if (disposition === null || !identifier(disposition.findingId) ||
        disposition.disposition !== "incorporated" || ids.has(disposition.findingId)) return null;
    const evidenceRefs = normalizeRefs(disposition.evidenceRefs, counter);
    if (evidenceRefs === null) return null;
    ids.add(disposition.findingId);
    normalizedDispositions.push(Object.freeze({ ...disposition, evidenceRefs }));
  }
  return Object.freeze({ ...reconciliation, dispositions: Object.freeze(normalizedDispositions) });
}

function normalizePlanGate(input) {
  if (input === null) return { state: "valid", planGate: null };
  const envelope = dataRecord(input, ENVELOPE_FIELDS);
  if (envelope === null || envelope.planGateSchemaVersion !== 1 ||
      envelope.contractVersion !== FURY_PLAN_GATE_CONTRACT_VERSION) {
    return { state: "invalid", reason: "INVALID_PLAN_REVIEW" };
  }
  const counter = { count: 0 };
  const review = normalizeReview(envelope.review, counter);
  if (review === null) return { state: "invalid", reason: "INVALID_PLAN_REVIEW" };
  if ((review.verdict === "PASS" || review.verdict === "FAIL") && envelope.reconciliation !== null) {
    return { state: "invalid", reason: "INVALID_PLAN_REVIEW" };
  }
  let reconciliation = null;
  if (envelope.reconciliation !== null) {
    reconciliation = normalizeReconciliation(envelope.reconciliation, counter);
    if (reconciliation === null) return { state: "invalid", reason: "INVALID_RECONCILIATION" };
  }
  return {
    state: "valid",
    planGate: Object.freeze({ ...envelope, review, reconciliation }),
  };
}

export function normalizeFuryPlanGateInputV1(input) {
  try {
    return normalizePlanGate(input);
  } catch {
    return { state: "invalid" };
  }
}

function normalizeExpected(input) {
  const expected = dataRecord(input, EXPECTED_FIELDS);
  if (expected === null || expected.schemaVersion !== 1 || expected.assuranceKind !== ASSURANCE ||
      expected.blueprintArtifactKind !== "implementation_blueprint" ||
      expected.blueprintOwningSeatId !== "may") return null;
  for (const field of [
    "missionId", "subjectId", "repositoryOwner", "repositoryName", "baseBranch",
    "missionBranch", "blueprintArtifactId",
  ]) if (!identifier(expected[field])) return null;
  if (!isFuryPlanGateArtifactPath(expected.blueprintArtifactPath) ||
      !Number.isSafeInteger(expected.prNumber) || expected.prNumber < 1 ||
      expected.prNumber > 2_147_483_647 || !REVISION.test(expected.currentBlueprintRevisionId)) return null;
  return Object.freeze({ ...expected });
}

function contextMatches(record, expected) {
  return CONTEXT_FIELDS.every((field) => record[field] === expected[field]);
}

function result(expected, planGate, eligibility, reasons) {
  return Object.freeze({
    state: "evaluated",
    planGateSchemaVersion: 1,
    contractVersion: FURY_PLAN_GATE_CONTRACT_VERSION,
    authority: "non_authoritative",
    evidenceAssurance: "reference_only_unverified",
    dispatchEligibility: eligibility,
    reviewerSeatId: "fury",
    verifierSeatId: planGate?.reconciliation ? "hill" : null,
    verdict: planGate?.review.verdict ?? null,
    reasonCodes: Object.freeze([...reasons]),
    binding: expected,
    review: planGate?.review ?? null,
    reconciliation: planGate?.reconciliation ?? null,
  });
}

export function evaluateFuryPlanGateV1(planGateInput, expectedInput) {
  try {
    const expected = normalizeExpected(expectedInput);
    if (expected === null) return invalidResult("INVALID_EXPECTED_BINDING");
    const normalized = normalizePlanGate(planGateInput);
    if (normalized.state !== "valid") return invalidResult(normalized.reason);
    const planGate = normalized.planGate;
    if (planGate === null) return result(expected, null, "ineligible", ["PLAN_REVIEW_REQUIRED"]);
    const review = planGate.review;
    if (!contextMatches(review, expected)) {
      return result(expected, planGate, "ineligible", ["REPLAY_BINDING_MISMATCH"]);
    }
    if (review.verdict === "PASS") {
      if (review.reviewedRevisionId !== expected.currentBlueprintRevisionId) {
        return result(expected, planGate, "ineligible", ["REVIEW_REVISION_STALE"]);
      }
      return result(expected, planGate, "eligible", []);
    }
    if (review.verdict === "FAIL") {
      if (review.reviewedRevisionId !== expected.currentBlueprintRevisionId) {
        return result(expected, planGate, "ineligible", ["REVIEW_REVISION_STALE"]);
      }
      return result(expected, planGate, "ineligible", ["REVIEW_FAILED"]);
    }
    const reconciliation = planGate.reconciliation;
    if (reconciliation === null) {
      return result(expected, planGate, "ineligible", ["RECONCILIATION_REQUIRED"]);
    }
    if (!contextMatches(reconciliation, expected) || reconciliation.reviewId !== review.reviewId ||
        reconciliation.reviewedRevisionId !== review.reviewedRevisionId) {
      return result(expected, planGate, "ineligible", ["RECONCILIATION_BINDING_MISMATCH"]);
    }
    if (reconciliation.correctedRevisionId === review.reviewedRevisionId) {
      return result(expected, planGate, "ineligible", ["CORRECTED_REVISION_NOT_DISTINCT"]);
    }
    if (reconciliation.additionalArchitectureChange !== false) {
      return result(expected, planGate, "ineligible", ["ADDITIONAL_ARCHITECTURE_CHANGE_REVIEW_REQUIRED"]);
    }
    const findings = new Set(review.findings.map(({ findingId }) => findingId));
    const dispositions = new Set(reconciliation.dispositions.map(({ findingId }) => findingId));
    if (findings.size !== dispositions.size || [...findings].some((id) => !dispositions.has(id))) {
      return result(expected, planGate, "ineligible", ["REQUIRED_CHANGE_SET_MISMATCH"]);
    }
    if (reconciliation.correctedRevisionId !== expected.currentBlueprintRevisionId) {
      return result(expected, planGate, "ineligible", ["RECONCILIATION_REVISION_STALE"]);
    }
    return result(expected, planGate, "eligible", []);
  } catch {
    return invalidResult("INVALID_PLAN_REVIEW");
  }
}
