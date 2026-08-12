import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import {
  FEATURE_CUMULATIVE_VALIDATION_SIGNATURE_DOMAIN,
  canonicalFeatureIntegrationJsonV1,
  computeFeatureCumulativeValidationAuthorityDigestV1,
  computeFeatureCumulativeValidationCandidateDigestV1,
  computeFeatureCumulativeValidationRequestDigestV1,
  createFeatureIntegrationEntryV1,
} from "../dist/feature-integration-v1.mjs";
import { acceptFeatureCumulativeValidationV1, executeFeatureCumulativeValidationCommandsV1, prepareFeatureCumulativeValidationV1 } from "../dist/feature-integration-validation-v1.mjs";
import { canonicalJson, computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import {
  MISSION_130_JOURNAL_DIGEST,
  createProfileAwareGovernanceDecisionEntryV1,
  createProfileAwareImplementationAuthorityEntryV1,
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  replayProfileAwareMissionJournal,
} from "../dist/profile-aware-mission-v1.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;

function executionFixture(overrides = {}) {
  const command = { commandId: "test", executable: "node", args: ["--test"], targetIds: ["@shield/team-system"] };
  const request = { schemaVersion: 1, operationId: "operation:test", repositoryId: "RanSolo/shield-workspace", terminalHeadRevision: "a".repeat(40), terminalTreeDigest: digest("a"), transitionReceiptDigest: digest("e"), commands: [command], commandIds: [command.commandId], targetIds: [...command.targetIds], validationIds: ["test"], requestDigest: digest("0") };
  request.requestDigest = computeFeatureCumulativeValidationRequestDigestV1(request);
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const binding = { schemaVersion: 1, bindingId: "binding:coulson", humanPrincipalId: "human:coulson", seatId: "coulson", missionScope: "*", signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64), publicKeySpkiBase64, validFromSequence: 0, validThroughSequence: null, attestedBy: "repository-policy:maintainer", provenanceRef: "repository-config:coulson" };
  const brief = createProfileAwareMissionBrief({ schemaVersion: 2, missionId: "mission:cumulative", objective: "Run one cumulative command", subjectId: "issue:226", riskFlags: { production: false, destructive: false, migration: false, credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: false }, participants: [{ seatId: "hill" }, { seatId: "may" }, { seatId: "coulson" }], activatedModes: [], requireSimmons: false, createdAt: { value: "2026-08-11T10:00:00Z", provenance: "humanRecorded" }, profileId: "standard", profileVersion: 1, requiredExecutionGateRoleIds: ["coulson"], requiredFinalAcceptanceGateRoleIds: ["coulson"], predecessorMissionId: "mission:issue-130", predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST });
  const implementationJournal = [createProfileAwareMissionBegunEntry(brief, [binding])];
  let projection = replayProfileAwareMissionJournal(implementationJournal).value;
  const requirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  const governancePayload = { schemaVersion: 1, evidenceId: "evidence:coulson:1", requirementId: requirement.requirementId, missionId: brief.missionId, revisionId: brief.revisionId, seatId: "coulson", evidenceKind: "mission_authorization", decision: "approved", humanPrincipalId: binding.humanPrincipalId, bindingId: binding.bindingId, signingKeyRef: binding.signingKeyRef, sourceRef: "manual:governance", timestamp: { value: "2026-08-11T10:01:00Z", provenance: "humanRecorded" }, journalSequence: 1 };
  implementationJournal.push(createProfileAwareGovernanceDecisionEntryV1({ projection, trustedBindings: [binding], evidence: { payload: governancePayload, signatureBase64: sign(null, Buffer.from(canonicalJson(governancePayload)), privateKey).toString("base64") } }));
  projection = replayProfileAwareMissionJournal(implementationJournal).value;
  const implementationPayload = { schemaVersion: 1, contractVersion: "implementation-authority.v1", authorityKind: "wheels_up", authorityRef: "authority:cumulative:1", missionId: brief.missionId, subjectId: brief.subjectId, seatId: "may", missionRevisionId: brief.revisionId, artifactRevisionId: digest("b"), repositoryId: overrides.repositoryId ?? request.repositoryId, canonicalWritableRoot: "/workspace/shield-workspace", branch: "feature/226", baseRevision: "b".repeat(40), headRevision: overrides.headRevision ?? request.terminalHeadRevision, modelId: "model:may", approvedRelativePaths: ["packages/shield-team-system"], approvedActionIds: overrides.approvedActionIds ?? ["validation:run"], approvedEffectClasses: overrides.approvedEffectClasses ?? ["verification"], approvedEffectKeys: overrides.approvedEffectKeys ?? ["effect:cumulative:one"], approvedCapabilities: overrides.approvedCapabilities ?? ["command_execution"], validationCommandIds: overrides.validationCommandIds ?? ["test"], journalSequence: 2, humanPrincipalId: binding.humanPrincipalId, humanBindingId: binding.bindingId, signingKeyRef: binding.signingKeyRef, sourceRef: "manual:implementation-authority", evidenceRef: "evidence:implementation-authority", timestamp: { value: "2026-08-11T10:02:00Z", provenance: "humanRecorded" } };
  const signedImplementationAuthority = { payload: implementationPayload, signatureBase64: sign(null, Buffer.from(canonicalJson(implementationPayload)), privateKey).toString("base64") };
  implementationJournal.push(createProfileAwareImplementationAuthorityEntryV1({ projection, trustedBindings: [binding], authority: signedImplementationAuthority }));
  let cumulativePayload = { schemaVersion: 1, authorityKind: "feature_cumulative_validation", missionId: brief.missionId, operationId: request.operationId, repositoryId: request.repositoryId, planDigest: digest("c"), featureAuthorityDigest: digest("d"), terminalHeadRevision: request.terminalHeadRevision, terminalTreeDigest: request.terminalTreeDigest, transitionReceiptDigest: request.transitionReceiptDigest, requestDigest: request.requestDigest, commandIds: [...request.commandIds], targetIds: [...request.targetIds], validationIds: [...request.validationIds], effectKey: "effect:cumulative:one", maxAttempts: 1, maxRetries: 0, activeAuthorityJournalSequence: 0, activeAuthorityOperationSequence: 0, issuedAt: "2026-08-11T10:00:00Z", expiresAt: "2029-08-11T10:00:00Z", humanPrincipalId: binding.humanPrincipalId, humanBindingId: binding.bindingId, signingKeyRef: binding.signingKeyRef, authorityDigest: digest("0") };
  cumulativePayload.authorityDigest = computeFeatureCumulativeValidationAuthorityDigestV1(cumulativePayload);
  const cumulativeBytes = Buffer.concat([Buffer.from(FEATURE_CUMULATIVE_VALIDATION_SIGNATURE_DOMAIN, "ascii"), Buffer.from([0]), Buffer.from(canonicalFeatureIntegrationJsonV1(cumulativePayload), "utf8")]);
  const signedAuthority = { payload: cumulativePayload, signatureBase64: sign(null, cumulativeBytes, privateKey).toString("base64") };
  let candidate = { schemaVersion: 1, operationId: request.operationId, authorityDigest: cumulativePayload.authorityDigest, requestDigest: request.requestDigest, effectKey: cumulativePayload.effectKey, terminalHeadRevision: request.terminalHeadRevision, terminalTreeDigest: request.terminalTreeDigest, transitionReceiptDigest: cumulativePayload.transitionReceiptDigest, candidateDigest: digest("0") };
  candidate.candidateDigest = computeFeatureCumulativeValidationCandidateDigestV1(candidate);
  const preparedEntry = createFeatureIntegrationEntryV1({ operationId: request.operationId, entrySequence: 3, entryKind: "effect_prepared", previousEntryDigest: digest("f"), payload: { effectClass: "cumulative_validation", candidate, candidateDigest: candidate.candidateDigest, effectKey: candidate.effectKey, requestDigest: candidate.requestDigest, expectedHeadRevision: candidate.terminalHeadRevision, expectedTreeDigest: candidate.terminalTreeDigest } });
  const replay = { replayContext: { operationId: request.operationId, repositoryId: request.repositoryId, activePlanDigest: cumulativePayload.planDigest, verifiedAuthorityDigest: cumulativePayload.featureAuthorityDigest, transitions: [{ kind: "integration", receiptDigest: cumulativePayload.transitionReceiptDigest }] }, nextEntrySequence: preparedEntry.entrySequence, activeAuthorityJournalSequence: 0, activeAuthorityOperationSequence: 0, terminalHeadRevision: request.terminalHeadRevision, terminalTreeDigest: request.terminalTreeDigest, pendingEffect: null, consumedCumulativeValidationEffectKeys: [], cumulativeValidationAttempts: 0, cumulativeValidation: "pending", nextStage: "cumulative_validation", latestObservedAt: { value: "2026-08-11T10:03:00Z", provenance: "hostTrusted" } };
  return { command, request, signedAuthority, trustedBindings: [binding], implementationJournal, preparedEntry, replay };
}

function prepared() {
  return executionFixture().preparedEntry;
}

test("cumulative command execution preserves exact order, targets, cache status, and terminal failures", () => {
  const fixture = executionFixture();
  const calls = [];
  const result = executeFeatureCumulativeValidationCommandsV1({
    ...fixture,
    commands: [fixture.command],
    run(executable, args) { calls.push([executable, ...args]); return { exitCode: 1, stdout: "out", stderr: "err", cached: true }; },
  });
  assert.equal(result.state, "accepted"); assert.equal(result.value.outcome, "failed");
  assert.deepEqual(calls, [["node", "--test"]]);
  assert.deepEqual(result.value.receipts.map((item) => item.cached), [true]);
});

test("runner exceptions are uncertainty, not validation failure", () => {
  const fixture = executionFixture();
  const result = executeFeatureCumulativeValidationCommandsV1({ ...fixture, commands: [fixture.command], run() { throw new Error("network"); } });
  assert.equal(result.state, "effect_uncertain"); assert.equal(result.reason, "runner_threw");
});

test("schema-9 authority and signed executable or argument drift fail before command effects", () => {
  for (const fixture of [executionFixture({ headRevision: "c".repeat(40) }), executionFixture({ validationCommandIds: ["build"] })]) {
    let calls = 0;
    const result = executeFeatureCumulativeValidationCommandsV1({ ...fixture, commands: [fixture.command], run() { calls += 1; return { exitCode: 0, stdout: "", stderr: "" }; } });
    assert.equal(result.state, "blocked");
    assert.equal(calls, 0);
  }
  const fixture = executionFixture();
  let calls = 0;
  const executableDrift = executeFeatureCumulativeValidationCommandsV1({ ...fixture, commands: [{ ...fixture.command, executable: "npx", args: ["nx", "test"] }], run() { calls += 1; return { exitCode: 0, stdout: "", stderr: "" }; } });
  assert.equal(executableDrift.state, "blocked");
  const substitutedCommand = { ...fixture.command, executable: "npx", args: ["nx", "test"] };
  const requestAndExecutableDrift = executeFeatureCumulativeValidationCommandsV1({ ...fixture, request: { ...fixture.request, commands: [substitutedCommand] }, commands: [substitutedCommand], run() { calls += 1; return { exitCode: 0, stdout: "", stderr: "" }; } });
  assert.equal(requestAndExecutableDrift.state, "blocked");
  assert.equal(calls, 0);
});

test("every schema-9 authority dimension must authorize the exact cumulative operation before effects", () => {
  const adversarialOverrides = [
    { approvedActionIds: ["different_action"] },
    { approvedEffectClasses: ["coordination"] },
    { approvedEffectKeys: ["effect:cumulative:other"] },
    { approvedCapabilities: ["different_capability"] },
  ];
  for (const overrides of adversarialOverrides) {
    const fixture = executionFixture(overrides);
    let calls = 0;
    const result = executeFeatureCumulativeValidationCommandsV1({ ...fixture, commands: [fixture.command], run() { calls += 1; return { exitCode: 0, stdout: "", stderr: "" }; } });
    assert.equal(result.state, "blocked");
    assert.equal(result.reason, "implementation_authority_mismatch");
    assert.equal(calls, 0);
  }
});

test("preparation and acceptance reject caller assertions without signed exact authority and Mack evidence", () => {
  assert.equal(prepareFeatureCumulativeValidationV1({ replay: { nextStage: "cumulative_validation", pendingEffect: null }, signedAuthority: {}, request: {}, candidate: {}, trustedBindings: [], observedAt: "2029-01-01T00:00:00Z", previousEntryDigest: digest("d") }).state, "blocked");
  assert.equal(acceptFeatureCumulativeValidationV1({ replay: {}, preparedEntry: prepared(), signedAuthority: {}, trustedBindings: [], request: {}, execution: {}, mackEvidence: {}, identity: {}, observedAt: {}, observationProvenance: "" }).state, "blocked");
});

test("fresh cumulative preparation and acceptance bind the exact transition, execution, and Mack evidence", () => {
  const fixture = executionFixture();
  const preparedResult = prepareFeatureCumulativeValidationV1({ replay: fixture.replay, signedAuthority: fixture.signedAuthority, request: fixture.request, candidate: fixture.preparedEntry.payload.candidate, trustedBindings: fixture.trustedBindings, observedAt: fixture.replay.latestObservedAt.value, previousEntryDigest: fixture.preparedEntry.previousEntryDigest });
  assert.equal(preparedResult.state, "accepted");
  const execution = executeFeatureCumulativeValidationCommandsV1({ ...fixture, preparedEntry: preparedResult.value.entry, commands: [fixture.command], run() { return { exitCode: 0, stdout: "ok", stderr: "", cached: false }; } });
  assert.equal(execution.state, "accepted");
  const mackEvidence = { evidenceDigest: digest("1"), repositoryId: fixture.request.repositoryId, headRevision: fixture.request.terminalHeadRevision, treeDigest: fixture.request.terminalTreeDigest, transitionReceiptDigest: fixture.request.transitionReceiptDigest, targetIds: [...fixture.request.targetIds], validationIds: [...fixture.request.validationIds], accepted: true, synthetic: false };
  const accepted = acceptFeatureCumulativeValidationV1({ replay: fixture.replay, preparedEntry: preparedResult.value.entry, signedAuthority: fixture.signedAuthority, trustedBindings: fixture.trustedBindings, request: fixture.request, execution: execution.value, mackEvidence, identity: { seatId: "mack", reasoningRuntimeId: "runtime:mack", modelId: "model:mack", toolExecutorId: "executor:runner" }, observedAt: { value: "2026-08-11T10:04:00Z", provenance: "hostTrusted" }, observationProvenance: "runner:test" });
  assert.equal(accepted.state, "accepted");
  assert.equal(accepted.value.receipt.transitionReceiptDigest, fixture.request.transitionReceiptDigest);

  const crossTransitionReplay = structuredClone(fixture.replay);
  crossTransitionReplay.replayContext.transitions[0].receiptDigest = digest("2");
  assert.equal(prepareFeatureCumulativeValidationV1({ replay: crossTransitionReplay, signedAuthority: fixture.signedAuthority, request: fixture.request, candidate: fixture.preparedEntry.payload.candidate, trustedBindings: fixture.trustedBindings, observedAt: crossTransitionReplay.latestObservedAt.value, previousEntryDigest: fixture.preparedEntry.previousEntryDigest }).state, "blocked");
  assert.equal(acceptFeatureCumulativeValidationV1({ replay: crossTransitionReplay, preparedEntry: preparedResult.value.entry, signedAuthority: fixture.signedAuthority, trustedBindings: fixture.trustedBindings, request: fixture.request, execution: execution.value, mackEvidence, identity: { seatId: "mack", reasoningRuntimeId: "runtime:mack", modelId: "model:mack", toolExecutorId: "executor:runner" }, observedAt: { value: "2026-08-11T10:04:00Z", provenance: "hostTrusted" }, observationProvenance: "runner:test" }).state, "blocked");
  assert.equal(acceptFeatureCumulativeValidationV1({ replay: fixture.replay, preparedEntry: preparedResult.value.entry, signedAuthority: fixture.signedAuthority, trustedBindings: fixture.trustedBindings, request: fixture.request, execution: execution.value, mackEvidence: { ...mackEvidence, transitionReceiptDigest: digest("2") }, identity: { seatId: "mack", reasoningRuntimeId: "runtime:mack", modelId: "model:mack", toolExecutorId: "executor:runner" }, observedAt: { value: "2026-08-11T10:04:00Z", provenance: "hostTrusted" }, observationProvenance: "runner:test" }).state, "blocked");
});
