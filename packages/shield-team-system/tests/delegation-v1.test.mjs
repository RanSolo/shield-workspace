import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import {
  canonicalDelegationJson,
  createDelegationLogEntry,
  createWheelsOffDelegation,
  createWheelsOffEligibility,
  evaluateWheelsOffEligibility,
  replayDelegationLog,
  validateWheelsOffDelegation,
  validateWheelsOffEligibility,
} from "../dist/delegation-v1.mjs";
import { computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";

function authority() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const binding = { bindingId: "binding:coulson", humanPrincipalId: "human:coulson", seatId: "coulson", missionScope: "*", signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64), publicKeySpkiBase64 };
  return { privateKey, binding };
}
function delegation(auth, sequence = 0, previousRevisionId = null) {
  return createWheelsOffDelegation({ schemaVersion: 1, delegationId: "delegation:default", previousRevisionId, repositoryId: "RanSolo/shield-workspace", authorityClass: "mission_initiation", policyId: "wheels_off.v1", humanPrincipalId: auth.binding.humanPrincipalId, bindingId: auth.binding.bindingId, signingKeyRef: auth.binding.signingKeyRef, issuedAt: { value: `2026-07-18T22:0${sequence}:00Z`, provenance: "humanRecorded" }, logSequence: sequence });
}
function envelope(auth, payload) { return { payload, signatureBase64: sign(null, Buffer.from(canonicalDelegationJson(payload)), auth.privateKey).toString("base64") }; }
function eligibility(brief, grant, overrides = {}) {
  return createWheelsOffEligibility({ schemaVersion: 1, eligibilityId: "eligibility:fixture", missionId: brief.missionId, missionRevisionId: brief.revisionId, delegationId: grant.delegationId, delegationRevisionId: grant.revisionId, repositoryId: grant.repositoryId, issueId: "issue:39", issueRevisionId: "sha256:issue39", issueSourceRef: "github:RanSolo/shield-workspace/issues/39", scopeItems: ["Implement closed delegated initiation."], acceptanceChecks: ["Delegated begin is replayable."], dependencies: [{ dependencyId: "issue:27", revisionId: "sha256:merged", status: "satisfied" }], architecturalDecisions: [{ decisionId: "fury:issue39", revisionId: "sha256:pass", status: "resolved" }], requestedAuthorities: ["implementation", "review_publication"], requireSimmons: false, ...overrides });
}
const brief = { missionId: "mission:wheels-off", revisionId: "sha256:brief", requireSimmons: false, participants: ["coulson", "fury", "fitz", "hill", "may"].map((seatId) => ({ seatId })), riskFlags: { production: false, destructive: false, migration: false, credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false } };

test("closed delegation and eligibility revisions are canonical and detect drift", () => {
  const auth = authority(); const grant = delegation(auth);
  assert.equal(validateWheelsOffDelegation(grant).state, "valid");
  assert.equal(validateWheelsOffDelegation({ ...grant, policyId: "opaque.v1" }).state, "invalid");
  assert.equal(validateWheelsOffDelegation({ ...grant, unknown: true }).state, "invalid");
  assert.equal(canonicalDelegationJson({ z: 1, a: 2 }), canonicalDelegationJson({ a: 2, z: 1 }));
});

test("signed grants, revisions, and revocations replay append-only", () => {
  const auth = authority(); const first = delegation(auth); const second = delegation(auth, 1, first.revisionId);
  const entries = [createDelegationLogEntry(envelope(auth, first), "delegation.granted"), createDelegationLogEntry(envelope(auth, second), "delegation.granted")];
  let replay = replayDelegationLog(entries, auth.binding, first.repositoryId);
  assert.equal(replay.state, "valid", replay.errors?.join(" "));
  assert.equal(replay.value.active[0].revisionId, second.revisionId);
  assert.deepEqual(replay.value.supersededRevisionIds, [first.revisionId]);
  const revocation = { schemaVersion: 1, revocationId: "revocation:default", delegationId: second.delegationId, delegationRevisionId: second.revisionId, repositoryId: second.repositoryId, reason: "maintainer_requested", humanPrincipalId: auth.binding.humanPrincipalId, bindingId: auth.binding.bindingId, signingKeyRef: auth.binding.signingKeyRef, revokedAt: { value: "2026-07-18T22:02:00Z", provenance: "humanRecorded" }, logSequence: 2 };
  entries.push(createDelegationLogEntry(envelope(auth, revocation), "delegation.revoked"));
  replay = replayDelegationLog(entries, auth.binding, first.repositoryId);
  assert.equal(replay.state, "valid", replay.errors?.join(" "));
  assert.equal(replay.value.active.length, 0); assert.deepEqual(replay.value.revokedRevisionIds, [second.revisionId]);
});

test("tampered, wrong-key, and non-Coulson delegation authority fails closed", () => {
  const auth = authority(); const grant = delegation(auth); const entry = createDelegationLogEntry(envelope(auth, grant), "delegation.granted");
  const tampered = structuredClone(entry); tampered.envelope.payload.repositoryId = "other/repository";
  assert.equal(replayDelegationLog([tampered], auth.binding, grant.repositoryId).state, "invalid");
  assert.equal(replayDelegationLog([entry], authority().binding, grant.repositoryId).state, "invalid");
  assert.equal(replayDelegationLog([entry], { ...auth.binding, seatId: "hill" }, grant.repositoryId).state, "invalid");
});

test("eligibility uses a fixed ordered rule table and all risk flags fail closed", () => {
  const auth = authority(); const grant = delegation(auth); const snapshot = eligibility(brief, grant);
  const eligible = evaluateWheelsOffEligibility({ brief, delegation: grant, eligibility: snapshot, repositoryId: grant.repositoryId, delegationState: "active" });
  assert.equal(eligible.state, "valid"); assert.equal(eligible.value.result, "eligible");
  assert.deepEqual(eligible.value.rules.map(({ ruleId }) => ruleId), ["delegation_active", "exact_revisions", "bounded_scope", "dependencies_satisfied", "architecture_resolved", "risk_flags_clear", "authority_bounded", "participants_present", "simmons_consistent"]);
  for (const risk of Object.keys(brief.riskFlags)) {
    const risky = { ...brief, riskFlags: { ...brief.riskFlags, [risk]: true } };
    const result = evaluateWheelsOffEligibility({ brief: risky, delegation: grant, eligibility: snapshot, repositoryId: grant.repositoryId, delegationState: "active" });
    assert.equal(result.value.result, "ineligible", risk);
    assert.ok(result.value.reasons.includes("risk_not_delegable"));
  }
});

test("closed negative eligibility facts produce ordered auditable rule failures", () => {
  const auth = authority(); const grant = delegation(auth);
  const snapshot = eligibility(brief, grant, {
    scopeItems: [],
    acceptanceChecks: [],
    dependencies: [{ dependencyId: "issue:27", revisionId: "sha256:merged", status: "unsatisfied" }],
    architecturalDecisions: [{ decisionId: "fury:issue39", revisionId: "sha256:pending", status: "unresolved" }],
    requestedAuthorities: ["implementation", "review_publication", "merge"],
  });
  assert.equal(validateWheelsOffEligibility(snapshot).state, "valid");
  const result = evaluateWheelsOffEligibility({ brief, delegation: grant, eligibility: snapshot, repositoryId: grant.repositoryId, delegationState: "active" });
  assert.equal(result.state, "valid");
  assert.equal(result.value.result, "ineligible");
  assert.deepEqual(result.value.rules.filter(({ state }) => state === "failed").map(({ ruleId }) => ruleId), ["bounded_scope", "dependencies_satisfied", "architecture_resolved", "authority_bounded"]);
  assert.deepEqual(result.value.reasons, ["eligibility_ambiguous", "dependency_unsatisfied", "architecture_unresolved", "authority_not_delegable"]);
  const { revisionId: _revisionId, ...content } = snapshot;
  assert.equal(validateWheelsOffEligibility(createWheelsOffEligibility({ ...content, dependencies: [{ dependencyId: "issue:27", revisionId: "sha256:merged", status: "unknown" }] })).state, "invalid");
  assert.equal(validateWheelsOffEligibility(createWheelsOffEligibility({ ...content, requestedAuthorities: ["implementation", "database_admin"] })).state, "invalid");
});
