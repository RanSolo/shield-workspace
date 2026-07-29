import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import {
  canonicalJson,
  computeEd25519SigningKeyRef,
} from "../dist/mission-v2.mjs";
import {
  createProfileAwareExecutionEffectEntryV1,
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  replayProfileAwareMissionJournal,
} from "../dist/profile-aware-mission-v1.mjs";
import {
  deriveMissionCycleIdentityV1,
  runMissionCycle,
} from "../dist/mission-runtime-v1.mjs";

function fixture({ profileId = "standard" } = {}) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const binding = {
    schemaVersion: 1,
    bindingId: "binding:coulson:runtime",
    humanPrincipalId: "human:coulson",
    seatId: "coulson",
    missionScope: "*",
    signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
    publicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:maintainer",
    provenanceRef: "repository-config:coulson",
  };
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId: "mission:runtime:test",
    objective: "Exercise one runtime cycle.",
    subjectId: "issue:130",
    riskFlags: { production: false, destructive: false, migration: false, credentialsOrSecurity: false, externalCommunication: false, merge: false, deploy: false, release: false, hillHighRisk: true },
    participants: [
      { seatId: "hill" },
      { seatId: "may" },
      { seatId: "coulson" },
      ...(profileId === "high_assurance" ? [{ seatId: "fitz" }] : []),
      ...(profileId === "product_sensitive" ? [{ seatId: "simmons" }] : []),
    ],
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-07-29T17:00:00Z", provenance: "humanRecorded" },
    profileId,
    profileVersion: 1,
    requiredExecutionGateRoleIds: profileId === "high_assurance"
      ? ["coulson", "fitz"]
      : profileId === "product_sensitive"
        ? ["coulson", "simmons"]
        : ["coulson"],
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: "sha256:7f1f8c50a703cf43e1c477d88446473c5d1d755b99a4ad35a2b6662558ded7b9",
  });
  const entries = [createProfileAwareMissionBegunEntry(brief, [binding])];
  const replayed = replayProfileAwareMissionJournal(entries);
  assert.equal(replayed.state, "valid");
  return { brief, entries, projection: replayed.value, binding, privateKey };
}

function input(brief, overrides = {}) {
  return {
    repositoryRoot: "/workspace/shield",
    configuredJournalPath: ".shield/runtime-test.jsonl",
    missionId: brief.missionId,
    expectedSubjectId: brief.subjectId,
    expectedRevisionId: brief.revisionId,
    expectedSequence: 0,
    seatId: "may",
    actionId: "implement-runtime",
    effectClass: "behavioral_implementation",
    validationId: "validation:runtime",
    activatedModes: [],
    actionAllowlist: ["implement-runtime"],
    ...overrides,
  };
}

test("current unauthorized schema-9 mission waits for Coulson without append or dispatch", async () => {
  const current = fixture();
  let appends = 0;
  let executions = 0;
  const result = await runMissionCycle(input(current.brief), {
    readJournal: async () => ({
      entries: current.entries,
      projection: current.projection,
      journalDigest: `sha256:${"a".repeat(64)}`,
    }),
    appendJournal: async () => { appends += 1; throw new Error("must not append"); },
    permissionAudit: {
      ledgerId: "ledger:runtime:test",
      read: async () => [],
      appendIfAbsent: async () => { throw new Error("must not audit"); },
    },
    getPermissionContext: async () => { throw new Error("must not authorize"); },
    executeTool: async () => { executions += 1; },
    requiredCapabilities: () => ["filesystem_write"],
    validate: async () => { throw new Error("must not validate"); },
    now: () => ({ value: "2026-07-29T17:01:00Z", provenance: "hostTrusted" }),
  });
  assert.deepEqual(result, {
    outcome: "waiting",
    missionId: current.brief.missionId,
    subjectId: current.brief.subjectId,
    revisionId: current.brief.revisionId,
    sequence: 0,
    accountableNextSeat: "coulson",
    reasonCode: "mission_authorization_required",
  });
  assert.equal(appends, 0);
  assert.equal(executions, 0);
});

test("unreadable and stale journals fail closed without fabricated subject identity", async () => {
  const current = fixture();
  const baseDependencies = {
    appendJournal: async () => { throw new Error("must not append"); },
    permissionAudit: {
      ledgerId: "ledger:runtime:test",
      read: async () => [],
      appendIfAbsent: async () => { throw new Error("must not audit"); },
    },
    getPermissionContext: async () => { throw new Error("must not authorize"); },
    executeTool: async () => { throw new Error("must not execute"); },
    requiredCapabilities: () => [],
    validate: async () => { throw new Error("must not validate"); },
    now: () => ({ value: "2026-07-29T17:01:00Z", provenance: "hostTrusted" }),
  };
  const unavailable = await runMissionCycle(input(current.brief), {
    ...baseDependencies,
    readJournal: async () => { throw new Error("unavailable"); },
  });
  assert.equal(unavailable.outcome, "blocked");
  assert.equal(unavailable.reasonCode, "journal_unavailable");
  assert.equal(unavailable.subjectId, current.brief.subjectId);

  const stale = await runMissionCycle(input(current.brief, {
    expectedRevisionId: "sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  }), {
    ...baseDependencies,
    readJournal: async () => ({
      entries: current.entries,
      projection: current.projection,
      journalDigest: digest(current.entries),
    }),
  });
  assert.equal(stale.outcome, "blocked");
  assert.equal(stale.reasonCode, "stale_revision");
  assert.equal(stale.subjectId, current.brief.subjectId);
});

test("runtime identities are fixed-length, validation-bound, and delimiter-safe", () => {
  const current = fixture();
  const left = deriveMissionCycleIdentityV1(input(current.brief, {
    actionId: "a:b",
    validationId: "c",
  }));
  const right = deriveMissionCycleIdentityV1(input(current.brief, {
    actionId: "a",
    validationId: "b:c",
  }));
  const changedValidation = deriveMissionCycleIdentityV1(input(current.brief, {
    actionId: "a:b",
    validationId: "different",
  }));
  assert.notDeepEqual(left, right);
  assert.notDeepEqual(left, changedValidation);
  for (const value of Object.values(left)) assert.match(value, /^(?:cycle|effect|decision):sha256:[A-Za-z0-9_-]{43}$/);
  assert.equal(canonicalJson(left), canonicalJson(deriveMissionCycleIdentityV1(input(current.brief, {
    actionId: "a:b",
    validationId: "c",
  }))));
});

function authorize(current) {
  const requirement = current.projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  const payload = {
    schemaVersion: 1,
    evidenceId: "evidence:coulson:runtime-authorization",
    requirementId: requirement.requirementId,
    missionId: current.brief.missionId,
    revisionId: current.brief.revisionId,
    seatId: "coulson",
    evidenceKind: "mission_authorization",
    decision: "approved",
    humanPrincipalId: current.binding.humanPrincipalId,
    bindingId: current.binding.bindingId,
    signingKeyRef: current.binding.signingKeyRef,
    sourceRef: "manual-signature:runtime",
    timestamp: { value: "2026-07-29T17:01:00Z", provenance: "humanRecorded" },
    journalSequence: 1,
  };
  current.entries.push({
    schemaVersion: 9,
    entryId: `entry:${current.brief.missionId}:1`,
    missionId: current.brief.missionId,
    sequence: 1,
    type: "governance.decided",
    timestamp: payload.timestamp,
    payload: {
      evidence: {
        payload,
        signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), current.privateKey).toString("base64"),
      },
    },
  });
  const replayed = replayProfileAwareMissionJournal(current.entries);
  assert.equal(replayed.state, "valid", replayed.errors?.join(" "));
  current.projection = replayed.value;
  return current;
}

function digest(entries) {
  return `sha256:${createHash("sha256").update(canonicalJson(entries)).digest("base64url")}`;
}

function inertDependencies(current, overrides = {}) {
  return {
    readJournal: async () => ({
      entries: structuredClone(current.entries),
      projection: structuredClone(current.projection),
      journalDigest: digest(current.entries),
    }),
    appendJournal: async () => { throw new Error("must not append"); },
    permissionAudit: {
      ledgerId: "ledger:runtime:inert",
      read: async () => [],
      appendIfAbsent: async () => { throw new Error("must not audit"); },
    },
    getPermissionContext: async () => { throw new Error("must not authorize"); },
    executeTool: async () => { throw new Error("must not execute"); },
    requiredCapabilities: () => [],
    validate: async () => { throw new Error("must not validate"); },
    now: () => ({ value: "2026-07-29T17:01:00Z", provenance: "hostTrusted" }),
    ...overrides,
  };
}

test("input validation distinguishes unbound identity from bound malformed input without invoking accessors", async () => {
  const current = fixture();
  let accesses = 0;
  const hostile = {};
  Object.defineProperty(hostile, "missionId", {
    enumerable: true,
    get() {
      accesses += 1;
      return current.brief.missionId;
    },
  });
  const unbound = await runMissionCycle(hostile, inertDependencies(current));
  assert.deepEqual(unbound, {
    outcome: "blocked",
    missionId: null,
    subjectId: null,
    revisionId: null,
    sequence: null,
    accountableNextSeat: null,
    reasonCode: "input_invalid",
  });
  assert.equal(accesses, 0);

  const bound = await runMissionCycle(
    { ...input(current.brief), unexpected: true },
    inertDependencies(current),
  );
  assert.deepEqual(bound, {
    outcome: "blocked",
    missionId: current.brief.missionId,
    subjectId: current.brief.subjectId,
    revisionId: current.brief.revisionId,
    sequence: 0,
    accountableNextSeat: "coulson",
    reasonCode: "input_invalid",
  });
});

test("subject identity is frozen and stale subject evidence fails before gates", async () => {
  const current = fixture();
  const cycleInput = input(current.brief);
  const pending = runMissionCycle(cycleInput, inertDependencies(current));
  cycleInput.expectedSubjectId = "issue:mutated";
  const frozen = await pending;
  assert.equal(frozen.outcome, "waiting");
  assert.equal(frozen.subjectId, current.brief.subjectId);

  const stale = await runMissionCycle(
    input(current.brief, { expectedSubjectId: "issue:other" }),
    inertDependencies(current),
  );
  assert.equal(stale.outcome, "blocked");
  assert.equal(stale.reasonCode, "stale_subject");
  assert.equal(stale.accountableNextSeat, "coulson");
});

test("high-assurance runtime routes the missing frozen execution gate to Fitz", async () => {
  const current = authorize(fixture({ profileId: "high_assurance" }));
  const result = await runMissionCycle(
    input(current.brief, { expectedSequence: 1 }),
    inertDependencies(current),
  );
  assert.equal(result.outcome, "waiting");
  assert.equal(result.reasonCode, "gate_missing");
  assert.equal(result.accountableNextSeat, "fitz");
});

test("any replayed uncertain effect blocks a different action before append or dispatch", async () => {
  const current = authorize(fixture());
  current.entries.push({
    schemaVersion: 9,
    entryId: `entry:${current.brief.missionId}:2`,
    missionId: current.brief.missionId,
    sequence: 2,
    type: "execution.transition",
    timestamp: { value: "2026-07-29T17:02:00Z", provenance: "hostTrusted" },
    payload: { from: "not-started", to: "running" },
  });
  let replayed = replayProfileAwareMissionJournal(current.entries);
  assert.equal(replayed.state, "valid", replayed.errors?.join(" "));
  current.projection = replayed.value;
  const uncertain = createProfileAwareExecutionEffectEntryV1({
    projection: current.projection,
    candidate: {
      runnerContractVersion: 1,
      candidateKind: "runner.supervised_effect_record",
      authority: "non_authoritative",
      journalSchemaVersion: 9,
      missionId: current.brief.missionId,
      subjectId: current.brief.subjectId,
      revisionId: current.brief.revisionId,
      expectedPreviousSequence: 2,
      intendedJournalSequence: 3,
      payload: {
        runnerContractVersion: 1,
        cycleId: "cycle:prior",
        subjectId: current.brief.subjectId,
        revisionId: current.brief.revisionId,
        evaluatedThroughSequence: 2,
        seatId: "may",
        actionId: "prior-action",
        effectClass: "behavioral_implementation",
        effectKey: "effect:prior",
        authorizationDecisionId: "decision:prior",
        outcome: "uncertain",
        reasonCode: "executor_uncertain",
        summary: "Prior dispatch is uncertain.",
        evidenceRefs: ["evidence:prior"],
      },
    },
    timestamp: { value: "2026-07-29T17:03:00Z", provenance: "hostTrusted" },
  });
  current.entries.push(uncertain);
  replayed = replayProfileAwareMissionJournal(current.entries);
  assert.equal(replayed.state, "valid", replayed.errors?.join(" "));
  current.projection = replayed.value;
  let appends = 0;
  let executions = 0;
  const result = await runMissionCycle(
    input(current.brief, {
      expectedSequence: 1,
      actionId: "different-action",
      validationId: "validation:different",
    }),
    inertDependencies(current, {
      appendJournal: async () => { appends += 1; throw new Error("must not append"); },
      executeTool: async () => { executions += 1; throw new Error("must not execute"); },
    }),
  );
  assert.equal(result.outcome, "uncertain");
  assert.equal(result.reasonCode, "effect_outcome_uncertain");
  assert.equal(result.accountableNextSeat, "coulson");
  assert.equal(appends, 0);
  assert.equal(executions, 0);
});

test("legacy invocation at the same tuple prevents redispatch and a different decision conflicts before gates", async () => {
  const current = fixture();
  const cycleInput = input(current.brief);
  const identity = deriveMissionCycleIdentityV1(cycleInput);
  const baseRecord = {
    schemaVersion: 1,
    recordType: "tool.invocation",
    authority: "non_authoritative",
    ledgerId: "ledger:runtime:legacy",
    recordedAt: "2026-07-29T17:01:00Z",
    decisionId: identity.decisionId,
    outcome: "allow",
    missionId: current.brief.missionId,
    subjectId: current.brief.subjectId,
    seatId: "may",
    reasoningRuntimeId: "runtime:ornith:may",
    toolExecutorId: "executor:codex-host",
    bindingId: "binding:runtime",
    bindingVersion: 1,
    repositoryId: "repo:shield",
    canonicalWritableRoot: "/workspace/shield",
    branch: "codex/issue-130-runtime-v2",
    revisionId: current.brief.revisionId,
    journalSequence: 0,
    actionId: cycleInput.actionId,
    effectClass: cycleInput.effectClass,
    effectKey: identity.effectKey,
    approvedScope: [],
    summary: null,
    evidenceRefs: [],
  };
  const permissionAudit = await import("../dist/permission-audit-v1.mjs");
  const legacy = permissionAudit.createPermissionAuditRecord({
    ...baseRecord,
    recordId: `audit-invocation:${identity.decisionId}`,
  });
  const legacyDecision = permissionAudit.createPermissionAuditRecord({
    ...baseRecord,
    recordId: `audit:${identity.decisionId}`,
    recordType: "permission.decision",
  });
  const uncertain = await runMissionCycle(cycleInput, inertDependencies(current, {
    permissionAudit: {
      ledgerId: legacy.ledgerId,
      read: async () => [legacyDecision, legacy],
      appendIfAbsent: async () => { throw new Error("must not audit"); },
    },
  }));
  assert.equal(uncertain.outcome, "uncertain");
  assert.equal(uncertain.reasonCode, "audit_incomplete");

  const conflict = permissionAudit.createPermissionAuditRecord({
    ...baseRecord,
    recordId: "audit-invocation:decision:other",
    decisionId: "decision:other",
  });
  const conflictDecision = permissionAudit.createPermissionAuditRecord({
    ...baseRecord,
    recordId: "audit:decision:other",
    recordType: "permission.decision",
    decisionId: "decision:other",
  });
  const blocked = await runMissionCycle(cycleInput, inertDependencies(current, {
    permissionAudit: {
      ledgerId: conflict.ledgerId,
      read: async () => [conflictDecision, conflict],
      appendIfAbsent: async () => { throw new Error("must not audit"); },
    },
  }));
  assert.equal(blocked.outcome, "blocked");
  assert.equal(blocked.reasonCode, "invocation_claim_conflict");
});

test("authorized runtime appends transition and effect once, verifies readback, and completes on replay", async () => {
  const current = authorize(fixture());
  const ledger = [];
  let executions = 0;
  let tick = 2;
  const cycleInput = input(current.brief, { expectedSequence: 1 });
  const identity = deriveMissionCycleIdentityV1(cycleInput);
  const appendIfAbsent = async (record) => {
    if (ledger.some(({ recordId }) => recordId === record.recordId)) return { appended: false };
    ledger.push(record);
    return {
      schemaVersion: 1,
      ledgerId: record.ledgerId,
      recordId: record.recordId,
      decisionId: record.decisionId,
      digest: record.digest,
      appended: true,
      ledgerSequence: ledger.length - 1,
    };
  };
  const dependencies = {
    readJournal: async () => ({
      entries: current.entries.map((entry) => structuredClone(entry)),
      projection: structuredClone(current.projection),
      journalDigest: digest(current.entries),
    }),
    appendJournal: async ({ entry }) => {
      if (entry.sequence !== current.entries.length) {
        return { state: "blocked", code: "stale_sequence", errors: ["stale"] };
      }
      current.entries.push(structuredClone(entry));
      const replayed = replayProfileAwareMissionJournal(current.entries);
      assert.equal(replayed.state, "valid", replayed.errors?.join(" "));
      current.projection = replayed.value;
      return { state: "appended", journalPath: ".shield/runtime-test.jsonl" };
    },
    permissionAudit: {
      ledgerId: "ledger:runtime:success",
      read: async () => structuredClone(ledger),
      appendIfAbsent,
    },
    getPermissionContext: async (plan, expectedDecisionId) => ({
      permissionContractVersion: 1,
      journalSchemaVersion: 9,
      missionId: plan.missionId,
      subjectId: plan.subjectId,
      missionRevisionId: plan.revisionId,
      artifactRevisionId: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
      evaluatedThroughSequence: plan.evaluatedThroughSequence,
      reasoningRuntimeId: "runtime:ornith:may",
      toolExecutorId: "executor:codex-host",
      repositoryId: "repo:shield",
      canonicalWritableRoot: "/workspace/shield",
      branch: "codex/issue-130-runtime-v2",
      requiredCapabilities: ["filesystem_write"],
      activeBindings: [{
        bindingSchemaVersion: 1,
        bindingId: "runtime-binding:may:runtime",
        bindingVersion: 1,
        missionId: plan.missionId,
        subjectId: plan.subjectId,
        missionRevisionId: plan.revisionId,
        seatId: "may",
        reasoningRuntimeId: "runtime:ornith:may",
        toolExecutorId: "executor:codex-host",
        repositoryId: "repo:shield",
        canonicalWritableRoot: "/workspace/shield",
        branch: "codex/issue-130-runtime-v2",
        artifactRevisionId: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
        recordedAtSequence: 1,
        activeThroughSequence: null,
        lifecycleState: "active",
        approvedScope: {
          actionIds: [plan.actionId],
          effectClasses: [plan.effectClass],
          effectKeys: [plan.effectKey],
          capabilities: ["filesystem_write"],
        },
        coulsonAuthorizationRef: "evidence:coulson:runtime-authorization",
      }],
      attestations: [
        { attestationSchemaVersion: 1, attestationId: "attestation:root", kind: "repository_root", hostId: "host:codex", toolExecutorId: "executor:codex-host", repositoryId: "repo:shield", canonicalWritableRoot: "/workspace/shield", capabilityId: null, observedValue: "/workspace/shield", observedAt: "2026-07-29T17:01:30Z", expiresAt: "2026-07-29T17:10:00Z" },
        { attestationSchemaVersion: 1, attestationId: "attestation:write", kind: "writability", hostId: "host:codex", toolExecutorId: "executor:codex-host", repositoryId: "repo:shield", canonicalWritableRoot: "/workspace/shield", capabilityId: null, observedValue: true, observedAt: "2026-07-29T17:01:30Z", expiresAt: "2026-07-29T17:10:00Z" },
        { attestationSchemaVersion: 1, attestationId: "attestation:filesystem", kind: "capability", hostId: "host:codex", toolExecutorId: "executor:codex-host", repositoryId: "repo:shield", canonicalWritableRoot: "/workspace/shield", capabilityId: "filesystem_write", observedValue: true, observedAt: "2026-07-29T17:01:30Z", expiresAt: "2026-07-29T17:10:00Z" },
      ],
      evaluatedAt: "2026-07-29T17:02:00Z",
      decisionId: expectedDecisionId,
    }),
    executeTool: async (plan) => {
      executions += 1;
      return {
        runnerContractVersion: 1,
        outcome: "completed",
        missionId: plan.missionId,
        subjectId: plan.subjectId,
        revisionId: plan.revisionId,
        evaluatedThroughSequence: plan.evaluatedThroughSequence,
        cycleId: plan.cycleId,
        seatId: plan.seatId,
        actionId: plan.actionId,
        effectClass: plan.effectClass,
        effectKey: plan.effectKey,
        summary: "Runtime implementation completed.",
        evidenceRefs: ["evidence:runtime:success"],
      };
    },
    requiredCapabilities: () => ["filesystem_write"],
    validate: async (plan) => ({
      runnerContractVersion: 1,
      outcome: "passed",
      missionId: plan.missionId,
      subjectId: plan.subjectId,
      revisionId: plan.revisionId,
      evaluatedThroughSequence: plan.evaluatedThroughSequence,
      cycleId: plan.cycleId,
      validationId: plan.validationId,
      effectKey: plan.effectKey,
      summary: "Runtime validation passed.",
    }),
    now: () => ({
      value: `2026-07-29T17:0${tick++}:00Z`,
      provenance: "hostTrusted",
    }),
  };
  const advanced = await runMissionCycle(cycleInput, dependencies);
  assert.equal(advanced.outcome, "advanced");
  assert.equal(advanced.sequence, 3);
  assert.equal(advanced.cycleId, identity.cycleId);
  assert.equal(executions, 1);
  assert.equal(current.projection.execution, "completed");
  assert.equal(current.projection.effects.length, 1);

  const replayed = await runMissionCycle(cycleInput, dependencies);
  assert.equal(replayed.outcome, "complete");
  assert.equal(replayed.sequence, 3);
  assert.equal(executions, 1);
});
