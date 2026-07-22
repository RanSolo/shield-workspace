import assert from "node:assert/strict";
import test from "node:test";

import {
  ADAPTER_CONTRACT_VERSION,
  COMMUNICATION_FAILURE_REASONS,
  validateAdapterCandidate,
  validateCommunicationRequest,
} from "../dist/adapter-v1.mjs";

const revisionId = "sha256:fixture-revision";

function request(overrides = {}) {
  return {
    requestId: "request:fixture",
    adapterContractVersion: 1,
    adapterId: "github",
    operation: "publish_status",
    missionId: "mission:fixture",
    subjectId: "issue:28",
    revisionId,
    artifactRevisionId: "0123456789012345678901234567890123456789",
    targetRef: "github:pr:28",
    ...overrides,
  };
}

function communicationCandidate(overrides = {}) {
  return {
    adapterContractVersion: 1,
    adapterId: "github",
    candidateId: "candidate:fixture",
    candidateKind: "communication_result",
    missionId: "mission:fixture",
    subjectId: "issue:28",
    revisionId,
    humanPrincipalId: null,
    bindingId: null,
    sourceRef: "github:pr:28:comment:1",
    capturedAt: { value: "2026-07-19T06:00:00Z", provenance: "hostTrusted" },
    payload: {
      requestId: "request:fixture",
      outcome: "delivered",
      failureReason: null,
      receiptRef: "github:pr:28:comment:1",
    },
    ...overrides,
  };
}

function followUpCandidate(overrides = {}) {
  return {
    adapterContractVersion: 1,
    adapterId: "github",
    candidateId: "candidate:follow-up:1",
    candidateKind: "follow_up_snapshot",
    missionId: "mission:fixture",
    subjectId: "issue:71",
    revisionId: "0123456789012345678901234567890123456789",
    humanPrincipalId: null,
    bindingId: null,
    sourceRef: "github:pr:71",
    capturedAt: { value: "2026-07-19T06:00:00Z", provenance: "hostTrusted" },
    payload: {
      lifecycleState: "follow_up_required",
      repository: "RanSolo/shield-workspace",
      branch: "codex/issue-71-follow-up-mode",
      prNumber: 71,
      headRefOid: "0123456789012345678901234567890123456789",
      reviewSourceRefs: ["github:pr:71:review:1"],
      findings: [{
        findingId: "finding:1",
        sourceKind: "review_comment",
        sourceRef: "github:pr:71:comment:1",
        headRefOid: "0123456789012345678901234567890123456789",
        classification: "architecture_conformance",
        routeToSeatId: "fury",
        blocking: true,
        requiresFuryFollowUp: true,
        summary: "Conformance may have drifted and needs Fury review.",
      }],
      replyRequirements: {
        concise: true,
        includeResolution: true,
        includeValidation: true,
        includeUnresolved: true,
      },
    },
    ...overrides,
  };
}

test("adapter v1 validates closed exact-revision requests", () => {
  assert.equal(ADAPTER_CONTRACT_VERSION, 1);
  assert.equal(validateCommunicationRequest(request()).state, "valid");
  assert.equal(validateCommunicationRequest(request({ adapterContractVersion: 2 })).state, "invalid");
  assert.equal(validateCommunicationRequest(request({ revisionId: "main" })).state, "invalid");
  assert.equal(validateCommunicationRequest({ ...request(), unexpected: true }).state, "invalid");
});

test("communication candidates expose only stable host-neutral outcomes", () => {
  assert.equal(validateAdapterCandidate(communicationCandidate()).state, "valid");
  for (const failureReason of COMMUNICATION_FAILURE_REASONS) {
    const candidate = communicationCandidate({
      candidateId: `candidate:${failureReason}`,
      payload: {
        requestId: "request:fixture",
        outcome: "failed",
        failureReason,
        receiptRef: null,
      },
    });
    assert.equal(validateAdapterCandidate(candidate).state, "valid", failureReason);
  }
  assert.equal(validateAdapterCandidate(communicationCandidate({
    payload: {
      requestId: "request:fixture",
      outcome: "delivered",
      failureReason: "unknown",
      receiptRef: null,
    },
  })).state, "invalid");
});

test("human evidence candidates must preserve every signed authority identity", () => {
  const evidence = {
    payload: {
      evidenceId: "evidence:fitz:1",
      missionId: "mission:fixture",
      subjectId: "issue:28",
      revisionId,
      humanPrincipalId: "human:fitz",
      bindingId: "binding:fitz",
      sourceRef: "manual-signature:fitz:1",
    },
    signatureBase64: "signed",
  };
  const candidate = {
    adapterContractVersion: 1,
    adapterId: "manual",
    candidateId: "evidence:fitz:1",
    candidateKind: "human_evidence",
    missionId: "mission:fixture",
    subjectId: "issue:28",
    revisionId,
    humanPrincipalId: "human:fitz",
    bindingId: "binding:fitz",
    sourceRef: "manual-signature:fitz:1",
    capturedAt: { value: "2026-07-19T06:00:00Z", provenance: "humanRecorded" },
    payload: { evidence },
  };
  assert.equal(validateAdapterCandidate(candidate).state, "valid");
  assert.equal(validateAdapterCandidate({ ...candidate, revisionId: "sha256:stale-revision" }).state, "invalid");
  assert.equal(validateAdapterCandidate({ ...candidate, humanPrincipalId: "github:user:fitz" }).state, "invalid");
});

test("follow-up snapshots bind GitHub review activity to the exact PR head without authority", () => {
  const candidate = followUpCandidate();
  assert.equal(validateAdapterCandidate(candidate).state, "valid");
  assert.equal(candidate.humanPrincipalId, null);
  assert.equal(candidate.bindingId, null);

  const awaiting = followUpCandidate({
    candidateId: "candidate:follow-up:awaiting",
    payload: {
      ...followUpCandidate().payload,
      lifecycleState: "awaiting_review",
      reviewSourceRefs: [],
      findings: [],
    },
  });
  assert.equal(validateAdapterCandidate(awaiting).state, "valid");
});

test("follow-up snapshots fail closed on stale head, duplicate findings, and wrong owner routing", () => {
  assert.equal(validateAdapterCandidate(followUpCandidate({
    payload: {
      ...followUpCandidate().payload,
      headRefOid: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
  })).state, "invalid");

  const duplicate = followUpCandidate({
    payload: {
      ...followUpCandidate().payload,
      findings: [
        followUpCandidate().payload.findings[0],
        { ...followUpCandidate().payload.findings[0], sourceRef: "github:pr:71:comment:2" },
      ],
    },
  });
  assert.equal(validateAdapterCandidate(duplicate).state, "invalid");

  const wrongSeat = followUpCandidate({
    payload: {
      ...followUpCandidate().payload,
      findings: [{
        ...followUpCandidate().payload.findings[0],
        routeToSeatId: "may",
      }],
    },
  });
  assert.equal(validateAdapterCandidate(wrongSeat).state, "invalid");
});
