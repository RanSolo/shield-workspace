import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  canonicalJson,
  computeEd25519SigningKeyRef,
  createEvidenceEntry,
  createDelegatedAuthorizationEntry,
  createDelegatedInvalidationEntry,
  createGovernanceEntry,
  createMissionBegunEntry,
  createSupervisedMissionBrief,
  planMissionStep,
  replaySupervisedMissionJournal,
  validateRepositoryBindings,
  validateSupervisedMissionBrief,
  verifySignedHumanEvidence,
} from "../dist/mission-v2.mjs";
import { canonicalDelegationJson, createDelegationLogEntry, createWheelsOffDelegation, createWheelsOffEligibility } from "../dist/delegation-v1.mjs";

function keyBinding(seatId, humanPrincipalId) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const signingKeyRef = computeEd25519SigningKeyRef(publicKeySpkiBase64);
  return {
    privateKey,
    binding: {
      schemaVersion: 1,
      bindingId: `binding:${seatId}`,
      humanPrincipalId,
      seatId,
      missionScope: "*",
      signingKeyRef,
      publicKeySpkiBase64,
      validFromSequence: 0,
      validThroughSequence: null,
      attestedBy: "repository-policy:maintainer",
      provenanceRef: `repository-config:${seatId}`,
    },
  };
}

function fixture(requireSimmons = false) {
  const coulson = keyBinding("coulson", "human:coulson");
  const fitz = keyBinding("fitz", "human:fitz");
  const simmons = keyBinding("simmons", "human:simmons");
  const brief = createSupervisedMissionBrief({
    schemaVersion: 1,
    missionId: requireSimmons ? "mission:with-simmons" : "mission:fixture",
    objective: "Complete one no-effect supervised fixture mission.",
    subjectId: "issue:39",
    riskFlags: {
      production: false,
      destructive: false,
      migration: false,
      credentialsOrSecurity: false,
      externalCommunication: false,
      merge: false,
      deploy: false,
      release: false,
      hillHighRisk: false,
    },
    participants: ["hill", "daisy", "fury", "may", "coulson", "fitz", ...(requireSimmons ? ["simmons"] : [])]
      .map((seatId) => ({ seatId })),
    activatedModes: [{ modeId: "delivery", modeVersion: "1.0.0", seatId: "hill", activationSource: "mission-brief" }],
    requireSimmons,
    createdAt: { value: "2026-07-18T20:00:00Z", provenance: "humanRecorded" },
  });
  const authorities = requireSimmons ? [coulson, fitz, simmons] : [coulson, fitz];
  const entries = [createMissionBegunEntry(brief, authorities.map(({ binding }) => binding))];
  return { brief, entries, coulson, fitz, simmons };
}

function replay(entries) {
  const result = replaySupervisedMissionJournal(entries);
  assert.equal(result.state, "valid", result.errors?.join(" "));
  return result.value;
}

function governanceTarget(decision, resumeState = "approved") {
  if (decision === "approved") return "approved";
  if (decision === "paused") return "paused";
  if (decision === "resumed") return resumeState;
  if (decision === "cancelled") return "cancelled";
  return null;
}

function evidence(authority, projection, requirement, decision, sequence, suffix = String(sequence), resumeState = "approved") {
  const payload = {
    schemaVersion: 1,
    evidenceId: `evidence:${authority.binding.seatId}:${suffix}`,
    requirementId: requirement.requirementId,
    missionId: projection.missionId,
    subjectKind: "mission_plan",
    subjectId: projection.brief.subjectId,
    revisionId: projection.brief.revisionId,
    seatId: authority.binding.seatId,
    evidenceKind: requirement.evidenceKind,
    decision,
    governanceTarget: authority.binding.seatId === "coulson" ? governanceTarget(decision, resumeState) : null,
    humanPrincipalId: authority.binding.humanPrincipalId,
    bindingId: authority.binding.bindingId,
    signingKeyRef: authority.binding.signingKeyRef,
    sourceRef: `manual-signature:${suffix}`,
    timestamp: { value: `2026-07-18T20:0${Math.min(sequence, 9)}:00Z`, provenance: "humanRecorded" },
    journalSequence: sequence,
  };
  return { payload, signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), authority.privateKey).toString("base64") };
}

test("canonical brief revisions ignore JSON key ordering and detect content drift", () => {
  const { brief } = fixture();
  assert.equal(validateSupervisedMissionBrief(brief).state, "valid");
  const reordered = JSON.parse(JSON.stringify(brief));
  reordered.objective = "Changed objective";
  assert.equal(validateSupervisedMissionBrief(reordered).state, "invalid");
  assert.equal(canonicalJson({ z: 1, a: { y: 2, b: 3 } }), canonicalJson({ a: { b: 3, y: 2 }, z: 1 }));
});

test("repository configuration selects exact content-addressed Ed25519 bindings", () => {
  const { brief, coulson, fitz } = fixture();
  const registry = { schemaVersion: 1, bindings: [coulson.binding, fitz.binding] };
  const configured = [
    { seatId: "coulson", bindingRef: coulson.binding.signingKeyRef },
    { seatId: "fitz", bindingRef: fitz.binding.signingKeyRef },
  ];
  assert.equal(validateRepositoryBindings(registry, configured, brief.missionId, false).state, "valid");
  assert.equal(validateRepositoryBindings(registry, [{ ...configured[0], bindingRef: fitz.binding.signingKeyRef }, configured[1]], brief.missionId, false).state, "invalid");
});

test("approval and no-effect steps keep execution separate from human acceptance readiness", () => {
  const fixtureData = fixture();
  const { entries, coulson, fitz } = fixtureData;
  let projection = replay(entries);
  assert.equal(projection.governance.state, "proposed");
  assert.equal(projection.readiness.execute.state, "waiting");
  assert.equal(projection.readiness.accept.state, "waiting");
  assert.equal(projection.communication.state, "not-configured");

  const authorization = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  const approval = evidence(coulson, projection, authorization, "approved", 1);
  const approvalEntry = createGovernanceEntry(projection, "approve", approval);
  assert.equal(approvalEntry.state, "valid", approvalEntry.errors?.join(" "));
  entries.push(approvalEntry.value);
  projection = replay(entries);
  assert.equal(projection.governance.state, "approved");
  assert.equal(projection.readiness.execute.state, "ready");

  const firstStep = planMissionStep(projection, { value: "2026-07-18T20:02:00Z", provenance: "hostTrusted" });
  assert.equal(firstStep.state, "valid");
  entries.push(firstStep.value.entry);
  projection = replay(entries);
  assert.equal(projection.execution.status, "running");

  const secondStep = planMissionStep(projection, { value: "2026-07-18T20:03:00Z", provenance: "hostTrusted" });
  entries.push(secondStep.value.entry);
  projection = replay(entries);
  assert.equal(projection.execution.status, "completed");
  assert.equal(projection.readiness.accept.state, "waiting");
  assert.equal(projection.readiness.accept.requirementStatuses[0].requiredSeatId, "fitz");
  assert.equal(planMissionStep(projection, { value: "2026-07-18T20:04:00Z", provenance: "hostTrusted" }).value.entry, null);

  const fitzRequirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "technical_review");
  const fitzEvidence = evidence(fitz, projection, fitzRequirement, "approved", 4);
  const evidenceEntry = createEvidenceEntry(projection, fitzEvidence);
  assert.equal(evidenceEntry.state, "valid", evidenceEntry.errors?.join(" "));
  entries.push(evidenceEntry.value);
  projection = replay(entries);
  assert.equal(projection.readiness.accept.state, "ready");
});

test("conditional Simmons remains an exact pending requirement until signed evidence arrives", () => {
  const { entries, coulson } = fixture(true);
  let projection = replay(entries);
  const authorization = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  entries.push(createGovernanceEntry(projection, "approve", evidence(coulson, projection, authorization, "approved", 1)).value);
  projection = replay(entries);
  assert.deepEqual(projection.readiness.accept.requirementStatuses.map(({ requiredSeatId }) => requiredSeatId), ["fitz", "simmons"]);
});

test("tampered, wrong-revision, wrong-seat, and wrong-sequence evidence fails closed", () => {
  const { entries, coulson, fitz } = fixture();
  const projection = replay(entries);
  const authorization = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  const validEnvelope = evidence(coulson, projection, authorization, "approved", 1);

  const tampered = structuredClone(validEnvelope);
  tampered.payload.sourceRef = "manual-signature:tampered";
  assert.equal(verifySignedHumanEvidence(tampered, projection, 1).state, "invalid");

  const stale = evidence(coulson, projection, authorization, "approved", 1, "stale");
  stale.payload.revisionId = "sha256:stale";
  stale.signatureBase64 = sign(null, Buffer.from(canonicalJson(stale.payload)), coulson.privateKey).toString("base64");
  assert.equal(verifySignedHumanEvidence(stale, projection, 1).state, "invalid");

  const wrongSeat = evidence(fitz, projection, authorization, "approved", 1, "wrong-seat");
  assert.equal(verifySignedHumanEvidence(wrongSeat, projection, 1).state, "invalid");
  assert.equal(verifySignedHumanEvidence(validEnvelope, projection, 2).state, "invalid");
});

test("pause, resume, and cancel require fresh Coulson evidence and append history", () => {
  const { entries, coulson } = fixture();
  let projection = replay(entries);
  const requirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  entries.push(createGovernanceEntry(projection, "approve", evidence(coulson, projection, requirement, "approved", 1)).value);
  projection = replay(entries);
  entries.push(createGovernanceEntry(projection, "pause", evidence(coulson, projection, requirement, "paused", 2), null).value);
  projection = replay(entries);
  assert.equal(projection.governance.state, "paused");
  assert.equal(planMissionStep(projection, { value: "2026-07-18T20:03:00Z", provenance: "hostTrusted" }).state, "invalid");
  const resumeEvidence = evidence(coulson, projection, requirement, "resumed", 3);
  assert.equal(createGovernanceEntry(projection, "resume", resumeEvidence, "proposed").state, "invalid");
  entries.push(createGovernanceEntry(projection, "resume", resumeEvidence, "approved").value);
  projection = replay(entries);
  entries.push(createGovernanceEntry(projection, "cancel", evidence(coulson, projection, requirement, "cancelled", 4), null).value);
  projection = replay(entries);
  assert.equal(projection.governance.state, "cancelled");
  assert.equal(entries.length, 5);
});

function delegatedFixture() {
  const data = fixture();
  const grant = createWheelsOffDelegation({ schemaVersion: 1, delegationId: "delegation:fixture", previousRevisionId: null, repositoryId: "RanSolo/shield-workspace", authorityClass: "mission_initiation", policyId: "wheels_off.v1", humanPrincipalId: data.coulson.binding.humanPrincipalId, bindingId: data.coulson.binding.bindingId, signingKeyRef: data.coulson.binding.signingKeyRef, issuedAt: { value: "2026-07-18T20:00:00Z", provenance: "humanRecorded" }, logSequence: 0 });
  const envelope = { payload: grant, signatureBase64: sign(null, Buffer.from(canonicalDelegationJson(grant)), data.coulson.privateKey).toString("base64") };
  const delegationLog = [createDelegationLogEntry(envelope, "delegation.granted")];
  const eligibility = createWheelsOffEligibility({ schemaVersion: 1, eligibilityId: "eligibility:fixture", missionId: data.brief.missionId, missionRevisionId: data.brief.revisionId, delegationId: grant.delegationId, delegationRevisionId: grant.revisionId, repositoryId: grant.repositoryId, issueId: "issue:39", issueRevisionId: "sha256:issue", issueSourceRef: "github:issue:39", scopeItems: ["Bounded implementation"], acceptanceChecks: ["Tests pass"], dependencies: [], architecturalDecisions: [], requestedAuthorities: ["implementation", "review_publication"], requireSimmons: false });
  const entries = [createMissionBegunEntry(data.brief, [data.coulson.binding, data.fitz.binding], 3)];
  return { ...data, grant, envelope, delegationLog, eligibility, entries };
}

test("delegated authorization is deterministic, distinct from human evidence, and invalidates to supervised fallback", () => {
  const data = delegatedFixture(); let projection = replay(data.entries);
  const evaluatedAt = { value: "2026-07-18T20:00:30Z", provenance: "hostTrusted" };
  const authorized = createDelegatedAuthorizationEntry({ projection, repositoryId: data.grant.repositoryId, delegationRevisionId: data.grant.revisionId, delegationLog: data.delegationLog, eligibility: data.eligibility, evaluatedAt });
  assert.equal(authorized.state, "valid", authorized.errors?.join(" ")); data.entries.push(authorized.value); projection = replay(data.entries);
  assert.deepEqual(authorized.value.timestamp, evaluatedAt);
  assert.equal(projection.journalSchemaVersion, 3); assert.equal(projection.governance.state, "approved");
  assert.deepEqual(projection.authorization, { source: "delegated", state: "authorized", missionRevisionId: data.brief.revisionId, delegationId: data.grant.delegationId, delegationRevisionId: data.grant.revisionId, eligibilityRevisionId: data.eligibility.revisionId, evaluatedThroughSequence: 1, reasons: [] });
  assert.equal(projection.evidence.length, 0); assert.equal(projection.readiness.execute.state, "ready");
  const invalidated = createDelegatedInvalidationEntry(projection, "scope_changed", { value: "2026-07-18T20:01:00Z", provenance: "hostTrusted" });
  data.entries.push(invalidated.value); projection = replay(data.entries);
  assert.equal(projection.governance.state, "proposed"); assert.equal(projection.authorization.state, "invalidated"); assert.equal(projection.readiness.execute.state, "waiting");
  const requirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  data.entries.push(createGovernanceEntry(projection, "approve", evidence(data.coulson, projection, requirement, "approved", 3)).value);
  projection = replay(data.entries); assert.equal(projection.authorization.source, "supervised"); assert.equal(projection.authorization.state, "authorized");
});

test("Kernel derives revoked and superseded lifecycle from the verified delegation log", () => {
  for (const lifecycle of ["revoked", "superseded"]) {
    const data = delegatedFixture();
    if (lifecycle === "revoked") {
      const revocation = { schemaVersion: 1, revocationId: "revocation:fixture", delegationId: data.grant.delegationId, delegationRevisionId: data.grant.revisionId, repositoryId: data.grant.repositoryId, reason: "maintainer_requested", humanPrincipalId: data.coulson.binding.humanPrincipalId, bindingId: data.coulson.binding.bindingId, signingKeyRef: data.coulson.binding.signingKeyRef, revokedAt: { value: "2026-07-18T20:00:10Z", provenance: "humanRecorded" }, logSequence: 1 };
      const envelope = { payload: revocation, signatureBase64: sign(null, Buffer.from(canonicalDelegationJson(revocation)), data.coulson.privateKey).toString("base64") };
      data.delegationLog.push(createDelegationLogEntry(envelope, "delegation.revoked"));
    } else {
      const { revisionId: _revisionId, ...grantContent } = data.grant;
      const replacement = createWheelsOffDelegation({ ...grantContent, previousRevisionId: data.grant.revisionId, issuedAt: { value: "2026-07-18T20:00:10Z", provenance: "humanRecorded" }, logSequence: 1 });
      const envelope = { payload: replacement, signatureBase64: sign(null, Buffer.from(canonicalDelegationJson(replacement)), data.coulson.privateKey).toString("base64") };
      data.delegationLog.push(createDelegationLogEntry(envelope, "delegation.granted"));
    }
    const projection = replay(data.entries);
    const authorization = createDelegatedAuthorizationEntry({ projection, repositoryId: data.grant.repositoryId, delegationRevisionId: data.grant.revisionId, delegationLog: data.delegationLog, eligibility: data.eligibility, evaluatedAt: { value: "2026-07-18T20:00:30Z", provenance: "hostTrusted" } });
    assert.equal(authorization.state, "valid", authorization.errors?.join(" "));
    assert.equal(authorization.value.payload.evaluation.result, "ineligible");
    assert.ok(authorization.value.payload.evaluation.reasons.includes(`delegation_${lifecycle}`));
    assert.equal(Object.hasOwn(authorization.value.payload, "delegationState"), false);
    const result = replay([...data.entries, authorization.value]);
    assert.equal(result.governance.state, "proposed");
    assert.equal(result.authorization.state, "ineligible");
  }
});

test("unrelated issue eligibility cannot authorize the verified mission subject", () => {
  const data = delegatedFixture(); const projection = replay(data.entries);
  const { revisionId: _revisionId, ...eligibilityContent } = data.eligibility;
  const eligibility = createWheelsOffEligibility({ ...eligibilityContent, issueId: "issue:unrelated" });
  const authorization = createDelegatedAuthorizationEntry({ projection, repositoryId: data.grant.repositoryId, delegationRevisionId: data.grant.revisionId, delegationLog: data.delegationLog, eligibility, evaluatedAt: { value: "2026-07-18T20:00:30Z", provenance: "hostTrusted" } });
  assert.equal(authorization.state, "valid", authorization.errors?.join(" "));
  assert.equal(authorization.value.payload.evaluation.result, "ineligible");
  assert.ok(authorization.value.payload.evaluation.reasons.includes("subject_mismatch"));
  const result = replay([...data.entries, authorization.value]);
  assert.equal(result.governance.state, "proposed");
  assert.equal(result.authorization.state, "ineligible");
});

test("ineligible delegated begin remains proposed and names deterministic failures", () => {
  const data = delegatedFixture(); const { revisionId: _briefRevision, ...briefContent } = data.brief;
  const riskyBrief = createSupervisedMissionBrief({ ...briefContent, riskFlags: { ...data.brief.riskFlags, deploy: true } });
  const { revisionId: _eligibilityRevision, ...eligibilityContent } = data.eligibility;
  const eligibility = createWheelsOffEligibility({ ...eligibilityContent, missionRevisionId: riskyBrief.revisionId });
  const entries = [createMissionBegunEntry(riskyBrief, [data.coulson.binding, data.fitz.binding], 3)]; const projection = replay(entries);
  entries.push(createDelegatedAuthorizationEntry({ projection, repositoryId: data.grant.repositoryId, delegationRevisionId: data.grant.revisionId, delegationLog: data.delegationLog, eligibility, evaluatedAt: { value: "2026-07-18T20:00:30Z", provenance: "hostTrusted" } }).value);
  const result = replay(entries); assert.equal(result.governance.state, "proposed"); assert.equal(result.authorization.state, "ineligible"); assert.ok(result.authorization.reasons.includes("risk_not_delegable"));
});
