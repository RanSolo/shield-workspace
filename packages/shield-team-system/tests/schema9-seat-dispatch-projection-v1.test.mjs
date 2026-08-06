import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { canonicalJson, computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import {
  createProfileAwareGovernanceDecisionEntryV1,
  createProfileAwareImplementationAuthorityEntryV1,
  createProfileAwareMissionBegunEntry,
  createProfileAwareMissionBrief,
  createProfileAwareRuntimeBindingRecordedEntryV1,
  MISSION_130_JOURNAL_DIGEST,
  replayProfileAwareMissionJournal,
} from "../dist/profile-aware-mission-v1.mjs";
import {
  computeImplementationAuthorityDigest,
  computeRuntimeBindingDigest,
  computeSchema9RuntimeBindingDigest,
} from "../dist/implementation-authority-v1.mjs";
import { resolveSupervisedMissionPaths } from "../dist/mission-store.mjs";
import { loadSchema9SeatDispatchProjectionV1 } from "../dist/schema9-seat-dispatch-projection-v1.mjs";

const HEAD = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const riskFlags = {
  production: false,
  destructive: false,
  migration: false,
  credentialsOrSecurity: false,
  externalCommunication: false,
  hillHighRisk: true,
  merge: false,
  deploy: false,
  release: false,
};

function signer(seatId) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  return {
    privateKey,
    binding: {
      schemaVersion: 1,
      bindingId: `binding:test:${seatId}`,
      humanPrincipalId: `human:test:${seatId}`,
      seatId,
      missionScope: "*",
      signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
      publicKeySpkiBase64,
      validFromSequence: 0,
      validThroughSequence: null,
      attestedBy: "repository-policy:maintainer",
      provenanceRef: `repository-config:test:${seatId}`,
    },
  };
}

function signed(payload, privateKey) {
  return { payload, signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString("base64") };
}

function replay(entries) {
  const result = replayProfileAwareMissionJournal(entries);
  assert.equal(result.state, "valid", result.errors?.join(" "));
  return result.value;
}

function evidence(authority, projection, requirement, sequence) {
  const payload = {
    schemaVersion: 1,
    evidenceId: `evidence:test:${authority.binding.seatId}:${sequence}`,
    requirementId: requirement.requirementId,
    missionId: projection.missionId,
    revisionId: projection.brief.revisionId,
    seatId: authority.binding.seatId,
    evidenceKind: requirement.evidenceKind,
    decision: "approved",
    humanPrincipalId: authority.binding.humanPrincipalId,
    bindingId: authority.binding.bindingId,
    signingKeyRef: authority.binding.signingKeyRef,
    sourceRef: `source:test:${authority.binding.seatId}:${sequence}`,
    timestamp: { value: `2026-08-05T15:${String(sequence).padStart(2, "0")}:00Z`, provenance: "humanRecorded" },
    journalSequence: sequence,
  };
  return signed(payload, authority.privateKey);
}

function implementationAuthority(brief, coulson, repositoryRoot, sequence) {
  return signed({
    schemaVersion: 1,
    contractVersion: "implementation-authority.v1",
    authorityKind: "wheels_up",
    authorityRef: `authority:${brief.missionId}:test`,
    missionId: brief.missionId,
    subjectId: brief.subjectId,
    seatId: "may",
    missionRevisionId: brief.revisionId,
    artifactRevisionId: HEAD,
    repositoryId: "repository:test:projection",
    canonicalWritableRoot: repositoryRoot,
    branch: "main",
    baseRevision: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    headRevision: HEAD,
    modelId: "model:test:may",
    approvedRelativePaths: ["src"],
    approvedActionIds: ["edit:implementation"],
    approvedEffectClasses: ["behavioral_implementation", "verification"],
    approvedEffectKeys: ["effect:test:implementation"],
    approvedCapabilities: ["filesystem_write"],
    validationCommandIds: ["validation:test"],
    journalSequence: sequence,
    humanPrincipalId: coulson.binding.humanPrincipalId,
    humanBindingId: coulson.binding.bindingId,
    signingKeyRef: coulson.binding.signingKeyRef,
    sourceRef: `source:test:authority:${sequence}`,
    evidenceRef: `evidence:test:authority:${sequence}`,
    timestamp: { value: `2026-08-05T15:${String(sequence).padStart(2, "0")}:00Z`, provenance: "humanRecorded" },
  }, coulson.privateKey);
}

function runtimeBinding(brief, authority, coulson, sequence) {
  const binding = {
    bindingSchemaVersion: 1,
    bindingId: `binding:${brief.missionId}:may`,
    bindingVersion: 1,
    missionId: brief.missionId,
    subjectId: brief.subjectId,
    missionRevisionId: brief.revisionId,
    seatId: "may",
    reasoningRuntimeId: "runtime:test:may",
    toolExecutorId: "executor:test:workspace",
    repositoryId: authority.repositoryId,
    canonicalWritableRoot: authority.canonicalWritableRoot,
    branch: authority.branch,
    artifactRevisionId: authority.artifactRevisionId,
    recordedAtSequence: sequence,
    activeThroughSequence: null,
    lifecycleState: "active",
    approvedScope: {
      actionIds: ["edit:implementation"],
      effectClasses: ["behavioral_implementation", "verification"],
      effectKeys: ["effect:test:implementation"],
      capabilities: ["filesystem_write"],
    },
    coulsonAuthorizationRef: `authorization:test:binding:${sequence}`,
  };
  const wrapper = {
    schemaVersion: 1,
    binding,
    implementationAuthorityRef: authority.authorityRef,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(authority),
    implementationAuthoritySequence: authority.journalSequence,
    approvedRelativePaths: ["src"],
    validationCommandIds: ["validation:test"],
    modelId: authority.modelId,
    baseRevision: authority.baseRevision,
    headRevision: authority.headRevision,
  };
  const payload = {
    schemaVersion: 1,
    authorizationId: binding.coulsonAuthorizationRef,
    missionId: brief.missionId,
    subjectId: brief.subjectId,
    seatId: "may",
    bindingId: binding.bindingId,
    bindingVersion: 1,
    priorBindingId: null,
    priorBindingVersion: null,
    bindingDigest: computeRuntimeBindingDigest(binding),
    schema9BindingDigest: computeSchema9RuntimeBindingDigest(wrapper),
    artifactRevisionId: binding.artifactRevisionId,
    decision: "approved",
    previousJournalSequence: sequence - 1,
    journalSequence: sequence,
    humanPrincipalId: coulson.binding.humanPrincipalId,
    humanBindingId: coulson.binding.bindingId,
    signingKeyRef: coulson.binding.signingKeyRef,
    sourceRef: `source:test:binding:${sequence}`,
    timestamp: { value: `2026-08-05T15:${String(sequence).padStart(2, "0")}:00Z`, provenance: "humanRecorded" },
  };
  return { wrapper, authorization: signed(payload, coulson.privateKey) };
}

function fixture(repositoryRoot, { includeExecutionGate = true, profileId = "high_assurance" } = {}) {
  const coulson = signer("coulson");
  const fitz = signer("fitz");
  const requiredExecutionGateRoleIds = profileId === "standard" ? ["coulson"] : ["coulson", "fitz"];
  const brief = createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId: `mission:test:projection:${profileId}`,
    objective: "Exercise the canonical schema-9 projection independently.",
    subjectId: `issue:test:projection:${profileId}`,
    riskFlags,
    participants: [{ seatId: "hill" }, { seatId: "may" }, { seatId: "coulson" }, ...(profileId === "standard" ? [] : [{ seatId: "fitz" }])],
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-08-05T15:00:00Z", provenance: "humanRecorded" },
    profileId,
    profileVersion: 1,
    requiredExecutionGateRoleIds,
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
  const trustedBindings = profileId === "standard" ? [coulson.binding] : [coulson.binding, fitz.binding];
  const entries = [createProfileAwareMissionBegunEntry(brief, trustedBindings)];
  let projection = replay(entries);
  const authorization = evidence(coulson, projection, projection.requirements.find(({ phase }) => phase === "authorization"), 1);
  entries.push(createProfileAwareGovernanceDecisionEntryV1({ projection, trustedBindings, evidence: authorization }));
  projection = replay(entries);

  if (profileId !== "standard" && includeExecutionGate) {
    const sequence = projection.lastSequence + 1;
    const gate = evidence(fitz, projection, projection.requirements.find(({ phase }) => phase === "execution"), sequence);
    entries.push({
      schemaVersion: 9,
      entryId: `entry:${brief.missionId}:${sequence}`,
      missionId: brief.missionId,
      sequence,
      type: "evidence.recorded",
      timestamp: gate.payload.timestamp,
      payload: { evidence: gate },
    });
    projection = replay(entries);
  }

  const authority = implementationAuthority(brief, coulson, repositoryRoot, projection.lastSequence + 1);
  entries.push(createProfileAwareImplementationAuthorityEntryV1({ projection, trustedBindings, authority }));
  projection = replay(entries);
  const binding = runtimeBinding(brief, authority.payload, coulson, projection.lastSequence + 1);
  entries.push(createProfileAwareRuntimeBindingRecordedEntryV1({
    projection,
    trustedBindings,
    binding: binding.wrapper,
    authorization: binding.authorization,
  }));
  projection = replay(entries);
  return { brief, entries, projection };
}

async function writeJournal(repositoryRoot, current) {
  const paths = resolveSupervisedMissionPaths(repositoryRoot, ".shield/journals", current.brief.missionId);
  assert.equal(paths.state, "valid");
  await mkdir(paths.value.root, { recursive: true });
  await writeFile(paths.value.journalPath, current.entries.map((entry) => `${JSON.stringify(entry)}\n`).join(""), "utf8");
  return paths.value.journalPath;
}

function hostOps(repositoryRoot, { topLevel = repositoryRoot, branch = () => "main", head = () => HEAD } = {}) {
  return {
    realpath: (path) => realpath(path),
    execFile: async (_command, args) => {
      const call = args.join(" ");
      if (call.endsWith("rev-parse --show-toplevel")) return `${topLevel}\n`;
      if (call.endsWith("rev-parse --abbrev-ref HEAD")) return `${await branch()}\n`;
      if (call.endsWith("rev-parse HEAD")) return `${await head()}\n`;
      throw new Error(`Unexpected git command: ${call}`);
    },
  };
}

function input(repositoryRoot, current, overrides = {}) {
  return {
    purpose: "specialist_dispatch",
    repositoryRoot,
    configuredJournalPath: ".shield/journals",
    missionId: current.brief.missionId,
    expectedSubjectId: current.brief.subjectId,
    expectedMissionRevisionId: current.brief.revisionId,
    expectedEvaluatedThroughSequence: current.projection.lastSequence,
    trustedHostOps: hostOps(repositoryRoot),
    ...overrides,
  };
}

test("ready projection derives high-assurance gate, explicit Wheels Up, immutable authority, and two observations", async () => {
  const repositoryRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-projection-ready-")));
  const current = fixture(repositoryRoot);
  await writeJournal(repositoryRoot, current);
  const result = await loadSchema9SeatDispatchProjectionV1(input(repositoryRoot, current));
  assert.equal(result.state, "ready");
  assert.equal(result.projection.purpose, "specialist_dispatch");
  assert.equal(result.projection.profile.executionReadiness, "ready");
  assert.deepEqual(result.projection.profile.satisfiedExecutionGates.map(({ requiredRoleId }) => requiredRoleId), ["fitz"]);
  assert.equal(result.projection.authorityPath, "explicit_wheels_up");
  assert.equal(result.projection.materialGateDisposition, "not_applicable_explicit_authority");
  assert.equal(result.projection.repositoryObservations.length, 2);
  assert.equal(result.projection.repositoryObservations.every(({ canonicalRoot, branch, headRevision }) => canonicalRoot === repositoryRoot && branch === "main" && headRevision === HEAD), true);
  assert.equal(Object.isFrozen(result.projection), true);
  assert.equal(Object.isFrozen(result.projection.mayRuntimeBinding.binding.binding.approvedScope), true);
  const { projectionDigest, ...content } = result.projection;
  const expectedDigest = `sha256:${createHash("sha256").update(canonicalJson(content)).digest("base64url")}`;
  assert.equal(projectionDigest, expectedDigest);
});

test("omitted high-assurance execution gate blocks without partial projection", async () => {
  const repositoryRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-projection-gate-")));
  const current = fixture(repositoryRoot, { includeExecutionGate: false });
  await writeJournal(repositoryRoot, current);
  const result = await loadSchema9SeatDispatchProjectionV1(input(repositoryRoot, current));
  assert.deepEqual(Object.keys(result).sort(), ["code", "errors", "state"]);
  assert.equal(result.state, "blocked");
  assert.equal(result.code, "profile_not_ready");
});

test("malformed on-disk schema-9 journal blocks without a partial projection", async () => {
  const repositoryRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-projection-malformed-")));
  const current = fixture(repositoryRoot, { profileId: "standard" });
  const journalPath = await writeJournal(repositoryRoot, current);
  await writeFile(journalPath, "{malformed-schema9-json", "utf8");

  const result = await loadSchema9SeatDispatchProjectionV1(input(repositoryRoot, current));
  assert.deepEqual(Object.keys(result).sort(), ["code", "errors", "state"]);
  assert.equal(result.state, "blocked");
  assert.equal(result.code, "journal_invalid");
  assert.equal(Object.hasOwn(result, "projection"), false);
});

test("closed purpose policy permits running only for runner permission", async () => {
  const repositoryRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-projection-purpose-")));
  const current = fixture(repositoryRoot, { profileId: "standard" });
  const sequence = current.projection.lastSequence + 1;
  current.entries.push({
    schemaVersion: 9,
    entryId: `entry:${current.brief.missionId}:${sequence}`,
    missionId: current.brief.missionId,
    sequence,
    type: "execution.transition",
    timestamp: { value: "2026-08-05T16:00:00Z", provenance: "hostTrusted" },
    payload: { from: "not-started", to: "running" },
  });
  current.projection = replay(current.entries);
  await writeJournal(repositoryRoot, current);

  const specialist = await loadSchema9SeatDispatchProjectionV1(input(repositoryRoot, current));
  assert.equal(specialist.state, "blocked");
  assert.equal(specialist.code, "lifecycle_inactive");

  const runner = await loadSchema9SeatDispatchProjectionV1(input(repositoryRoot, current, { purpose: "runner_permission" }));
  assert.equal(runner.state, "ready");
  assert.equal(runner.projection.purpose, "runner_permission");
  assert.equal(runner.projection.lifecycle.execution, "running");
});

test("stale sequence and independently mutated root, branch, HEAD, and journal fail closed", async () => {
  const repositoryRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-projection-mutations-")));
  const otherRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-projection-other-root-")));
  const current = fixture(repositoryRoot, { profileId: "standard" });
  await writeJournal(repositoryRoot, current);

  const stale = await loadSchema9SeatDispatchProjectionV1(input(repositoryRoot, current, { expectedEvaluatedThroughSequence: current.projection.lastSequence - 1 }));
  assert.equal(stale.state, "blocked");
  assert.equal(stale.code, "sequence_mismatch");

  const root = await loadSchema9SeatDispatchProjectionV1(input(repositoryRoot, current, { trustedHostOps: hostOps(repositoryRoot, { topLevel: otherRoot }) }));
  assert.equal(root.state, "blocked");
  assert.equal(root.code, "root_mismatch");

  const branch = await loadSchema9SeatDispatchProjectionV1(input(repositoryRoot, current, { trustedHostOps: hostOps(repositoryRoot, { branch: () => "agent/stale" }) }));
  assert.equal(branch.state, "blocked");
  assert.equal(branch.code, "branch_mismatch");

  let headCalls = 0;
  const head = await loadSchema9SeatDispatchProjectionV1(input(repositoryRoot, current, {
    trustedHostOps: hostOps(repositoryRoot, { head: () => ++headCalls === 1 ? HEAD : "cccccccccccccccccccccccccccccccccccccccc" }),
  }));
  assert.equal(head.state, "blocked");
  assert.equal(head.code, "head_mismatch");

  const replacement = fixture(repositoryRoot, { profileId: "standard" });
  const journalPath = await writeJournal(repositoryRoot, current);
  let journalHeadCalls = 0;
  const journal = await loadSchema9SeatDispatchProjectionV1(input(repositoryRoot, current, {
    trustedHostOps: hostOps(repositoryRoot, {
      head: async () => {
        journalHeadCalls += 1;
        if (journalHeadCalls === 2) await writeFile(journalPath, replacement.entries.map((entry) => `${JSON.stringify(entry)}\n`).join(""), "utf8");
        return HEAD;
      },
    }),
  }));
  assert.equal(journal.state, "blocked");
  assert.equal(journal.code, "journal_drift");
});

test("hostile input shapes and arbitrary lifecycle policies are rejected before host calls", async () => {
  let hostCalls = 0;
  const base = {
    purpose: "specialist_dispatch",
    repositoryRoot: "/workspace/repository",
    configuredJournalPath: ".shield/journals",
    missionId: "mission:test:hostile",
    expectedSubjectId: "issue:test:hostile",
    expectedMissionRevisionId: "sha256:1111111111111111111111111111111111111111111",
    expectedEvaluatedThroughSequence: 0,
    trustedHostOps: { execFile: async () => { hostCalls += 1; return ""; } },
  };
  const accessor = { ...base };
  Object.defineProperty(accessor, "repositoryRoot", { enumerable: true, get: () => { hostCalls += 1; return "/workspace/repository"; } });
  const inherited = Object.assign(Object.create({ purpose: "specialist_dispatch" }), { ...base });
  delete inherited.purpose;
  const symbol = { ...base, [Symbol("authority")]: true };
  const nonEnumerable = { ...base };
  Object.defineProperty(nonEnumerable, "purpose", { enumerable: false, value: "specialist_dispatch" });
  const arbitraryStates = { ...base, purpose: ["not-started", "running"] };
  for (const hostile of [accessor, inherited, symbol, nonEnumerable, arbitraryStates, new Proxy(base, {})]) {
    const result = await loadSchema9SeatDispatchProjectionV1(hostile);
    assert.equal(result.state, "blocked");
    assert.equal(result.code, "input_invalid");
  }
  assert.equal(hostCalls, 0);
});
