import assert from "node:assert/strict";
import test from "node:test";

import {
  SONARQUBE_EVIDENCE_CONTRACT_VERSION,
  SONARQUBE_EVIDENCE_SCHEMA_VERSION,
  evaluateSonarQubeEvidenceV1,
} from "../dist/sonarqube-evidence-v1.mjs";

const head = "0123456789012345678901234567890123456789";

function expected(overrides = {}) {
  return {
    schemaVersion: 1,
    missionId: "mission:fixture",
    subjectId: "issue:72",
    repository: "RanSolo/shield-workspace",
    branch: "codex/issue-72-sonarqube-evidence",
    prNumber: 72,
    artifactRevisionId: head,
    ...overrides,
  };
}

function finding(overrides = {}) {
  return {
    findingId: "sonar:finding:1",
    ruleId: "typescript:S1117",
    severity: "MAJOR",
    classification: "actionable",
    sourceRef: "sonarqube:issue:1",
    componentPath: "packages/shield-team-system/src/fixture.mts",
    line: 12,
    message: "Fix the duplicated key before accepting the validation evidence.",
    ...overrides,
  };
}

function evidence(overrides = {}) {
  return {
    schemaVersion: 1,
    contractVersion: "sonarqube.evidence.v1",
    assuranceKind: "host_asserted_non_authoritative",
    evidenceId: "sonarqube:evidence:1",
    missionId: "mission:fixture",
    subjectId: "issue:72",
    repository: "RanSolo/shield-workspace",
    branch: "codex/issue-72-sonarqube-evidence",
    prNumber: 72,
    artifactRevisionId: head,
    capturedAt: "2026-07-22T02:30:00Z",
    scannerSourceRef: "sonarqube:analysis:1",
    findings: [],
    acceptedExceptions: [],
    ...overrides,
  };
}

test("SonarQube evidence binds to the exact repository branch PR and revision", () => {
  assert.equal(SONARQUBE_EVIDENCE_SCHEMA_VERSION, 1);
  assert.equal(SONARQUBE_EVIDENCE_CONTRACT_VERSION, "sonarqube.evidence.v1");
  const result = evaluateSonarQubeEvidenceV1(evidence(), expected());
  assert.equal(result.state, "evaluated");
  assert.equal(result.authority, "non_authoritative");
  assert.equal(result.advancementEligibility, "eligible");
  assert.deepEqual(result.reasonCodes, []);
  assert.deepEqual(result.findings, []);
});

test("missing stale ambiguous or mismatched SonarQube evidence fails closed", () => {
  assert.deepEqual(evaluateSonarQubeEvidenceV1(null, expected()), {
    state: "invalid",
    schemaVersion: 1,
    authority: "non_authoritative",
    advancementEligibility: "ineligible",
    reasonCodes: ["EVIDENCE_REQUIRED"],
  });
  assert.deepEqual(evaluateSonarQubeEvidenceV1(evidence({ artifactRevisionId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }), expected()), {
    state: "invalid",
    schemaVersion: 1,
    authority: "non_authoritative",
    advancementEligibility: "ineligible",
    reasonCodes: ["EVIDENCE_BINDING_MISMATCH"],
  });
  assert.equal(evaluateSonarQubeEvidenceV1(evidence({
    findings: [
      finding({ findingId: "sonar:finding:dupe", sourceRef: "sonarqube:issue:dupe" }),
      finding({ findingId: "sonar:finding:dupe", sourceRef: "sonarqube:issue:dupe-2" }),
    ],
  }), expected()).advancementEligibility, "ineligible");
});

test("Hill receives closed routing for actionable uncertain and architecture findings", () => {
  const result = evaluateSonarQubeEvidenceV1(evidence({
    findings: [
      finding({ findingId: "sonar:finding:may", classification: "actionable", sourceRef: "sonarqube:issue:may" }),
      finding({ findingId: "sonar:finding:daisy", classification: "uncertain", sourceRef: "sonarqube:issue:daisy" }),
      finding({ findingId: "sonar:finding:fury", classification: "architecture_conformance", sourceRef: "sonarqube:issue:fury" }),
    ],
  }), expected());
  assert.equal(result.state, "evaluated");
  assert.equal(result.advancementEligibility, "ineligible");
  assert.deepEqual(result.reasonCodes, [
    "BLOCKING_FINDINGS",
    "UNCERTAIN_FINDINGS",
    "ARCHITECTURE_FINDINGS_REQUIRE_FURY",
  ]);
  assert.deepEqual(result.findings.map((item) => [item.findingId, item.routeToSeatId, item.blocksAdvancement]), [
    ["sonar:finding:may", "may", true],
    ["sonar:finding:daisy", "daisy", true],
    ["sonar:finding:fury", "fury", true],
  ]);
});

test("advisory findings do not automatically block advancement", () => {
  const result = evaluateSonarQubeEvidenceV1(evidence({
    findings: [finding({
      findingId: "sonar:finding:advisory",
      classification: "advisory",
      severity: "INFO",
      sourceRef: "sonarqube:issue:advisory",
    })],
  }), expected());
  assert.equal(result.state, "evaluated");
  assert.equal(result.advancementEligibility, "eligible");
  assert.equal(result.findings[0].routeToSeatId, "hill");
  assert.equal(result.findings[0].blocksAdvancement, false);
});

test("false positives and accepted risks require rationale and accountable attribution", () => {
  const falsePositive = evidence({
    findings: [finding({
      findingId: "sonar:finding:false-positive",
      classification: "false_positive",
      sourceRef: "sonarqube:issue:false-positive",
    })],
  });
  const missingRationale = evaluateSonarQubeEvidenceV1(falsePositive, expected());
  assert.equal(missingRationale.advancementEligibility, "ineligible");
  assert.deepEqual(missingRationale.reasonCodes, ["EXCEPTION_RATIONALE_REQUIRED"]);

  const accepted = evaluateSonarQubeEvidenceV1(evidence({
    findings: [finding({
      findingId: "sonar:finding:false-positive",
      classification: "false_positive",
      sourceRef: "sonarqube:issue:false-positive",
    })],
    acceptedExceptions: [{
      findingId: "sonar:finding:false-positive",
      disposition: "accepted_false_positive",
      rationale: "Sonar matched generated fixture text that is intentionally duplicated.",
      accountableSeatId: "coulson",
    }],
  }), expected());
  assert.equal(accepted.advancementEligibility, "eligible");
  assert.equal(accepted.findings[0].exception.accountableSeatId, "coulson");

  const acceptedRisk = evaluateSonarQubeEvidenceV1(evidence({
    findings: [finding({
      findingId: "sonar:finding:risk",
      classification: "blocking",
      sourceRef: "sonarqube:issue:risk",
    })],
    acceptedExceptions: [{
      findingId: "sonar:finding:risk",
      disposition: "accepted_risk",
      rationale: "Coulson accepted this as a documented non-blocker for the mission scope.",
      accountableSeatId: "coulson",
    }],
  }), expected());
  assert.equal(acceptedRisk.advancementEligibility, "eligible");
  assert.equal(acceptedRisk.findings[0].blocksAdvancement, false);
});

