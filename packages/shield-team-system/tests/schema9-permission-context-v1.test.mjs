import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access as fsAccess, mkdtemp, mkdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";

import { canonicalJson, computeEd25519SigningKeyRef, createMissionBegunEntry, createSupervisedMissionBrief } from "../dist/mission-v2.mjs";
import {
  createProfileAwareImplementationAuthorityEntryV1,
  createProfileAwareImplementationAuthorityRevocationEntryV1,
  createProfileAwareDaisyCoordinationAuthorityEntryV1,
  createProfileAwareDaisyRuntimeBindingEntryV1,
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
import {
  computeDaisyCoordinationAuthorityDigest,
  computeDaisyCoordinationRuntimeBindingDigest,
} from "../dist/daisy-coordination-authority-v1.mjs";
import { loadSchema9PermissionContextV1 } from "../dist/schema9-permission-context-v1.mjs";
import { loadSchema9SeatDispatchProjectionV1 } from "../dist/schema9-seat-dispatch-projection-v1.mjs";
import { createPermissionAuthorizer } from "../dist/permission-v1.mjs";
import { resolveSupervisedMissionPaths } from "../dist/mission-store.mjs";

const execFile = promisify(execFileCallback);

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
const FIXED_HEAD_REVISION = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function signPayload(payload, privateKey) {
  return {
    payload,
    signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString("base64"),
  };
}

function authoritySigner() {
  const privateKey = createPrivateKey({
    key: Buffer.from("MC4CAQAwBQYDK2VwBCIEID/cisfo2rCW/eukdWSETKZs3ISkUTRw94WoAnBmWpkg", "base64"),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey(privateKey);
  return {
    privateKey,
    binding: {
      schemaVersion: 1,
      bindingId: "binding:coulson",
      humanPrincipalId: "human:coulson",
      seatId: "coulson",
      missionScope: "*",
      signingKeyRef: computeEd25519SigningKeyRef(publicKey.export({ format: "der", type: "spki" }).toString("base64")),
      publicKeySpkiBase64: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
      validFromSequence: 0,
      validThroughSequence: null,
      attestedBy: "repository-policy:maintainer",
      provenanceRef: "repository-config:coulson",
    },
  };
}

function canonicalSha256(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

const ROOT_DERIVED_GOLDEN_FIELDS = new Set([
  "signatureBase64",
  "attestationId",
  "implementationAuthorityDigest",
  "bindingDigest",
  "schema9BindingDigest",
  "journalDigest",
  "projectionDigest",
  "digest",
]);

function normalizeGoldenRepositoryEvidence(value, repositoryRoots, fieldName = "") {
  if (ROOT_DERIVED_GOLDEN_FIELDS.has(fieldName)) {
    return `<root-derived:${fieldName}>`;
  }
  if (fieldName === "attestationIds" && Array.isArray(value)) {
    return value.map(() => "<root-derived:attestationId>");
  }
  if (typeof value === "string") {
    return repositoryRoots.reduce(
      (normalized, repositoryRoot) => normalized.replaceAll(repositoryRoot, "<repository-root>"),
      value,
    );
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeGoldenRepositoryEvidence(item, repositoryRoots));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeGoldenRepositoryEvidence(item, repositoryRoots, key)]),
    );
  }
  return value;
}

function missionBrief(profile = "standard", includeDaisy = false) {
  const profileGates = profile === "standard" ? ["coulson"] : profile === "high_assurance" ? ["coulson", "fitz"] : ["coulson", "simmons"];
  return createProfileAwareMissionBrief({
    schemaVersion: 2,
    missionId: `mission:schema9:${profile}`,
    objective: "Permission context fixture for schema-9 loader coverage.",
    subjectId: `issue:schema9-${profile}`,
    riskFlags,
    participants: [{ seatId: "hill" }, { seatId: "may" }, ...(includeDaisy ? [{ seatId: "daisy" }] : []), ...profileGates.map((seatId) => ({ seatId }))],
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-07-29T15:00:00Z", provenance: "humanRecorded" },
    profileId: profile,
    profileVersion: 1,
    requiredExecutionGateRoleIds: profileGates,
    requiredFinalAcceptanceGateRoleIds: ["coulson"],
    predecessorMissionId: "mission:issue-130",
    predecessorJournalDigest: MISSION_130_JOURNAL_DIGEST,
  });
}

function governanceEvidence(authorityBinding, projection, requirement, sequence) {
  return {
    payload: {
      schemaVersion: 1,
      evidenceId: `evidence:${authorityBinding.binding.seatId}:${sequence}`,
      requirementId: requirement.requirementId,
      missionId: projection.missionId,
      revisionId: projection.brief.revisionId,
      seatId: authorityBinding.binding.seatId,
      evidenceKind: requirement.evidenceKind,
      decision: "approved",
      humanPrincipalId: authorityBinding.binding.humanPrincipalId,
      bindingId: authorityBinding.binding.bindingId,
      signingKeyRef: authorityBinding.binding.signingKeyRef,
      sourceRef: `evidence:${authorityBinding.binding.seatId}:${sequence}`,
      timestamp: { value: `2026-07-29T15:${String(sequence).padStart(2, "0")}:00Z`, provenance: "humanRecorded" },
      journalSequence: sequence,
    },
    signatureBase64: signPayload({
      schemaVersion: 1,
      evidenceId: `evidence:${authorityBinding.binding.seatId}:${sequence}`,
      requirementId: requirement.requirementId,
      missionId: projection.missionId,
      revisionId: projection.brief.revisionId,
      seatId: authorityBinding.binding.seatId,
      evidenceKind: requirement.evidenceKind,
      decision: "approved",
      humanPrincipalId: authorityBinding.binding.humanPrincipalId,
      bindingId: authorityBinding.binding.bindingId,
      signingKeyRef: authorityBinding.binding.signingKeyRef,
      sourceRef: `evidence:${authorityBinding.binding.seatId}:${sequence}`,
      timestamp: { value: `2026-07-29T15:${String(sequence).padStart(2, "0")}:00Z`, provenance: "humanRecorded" },
      journalSequence: sequence,
    }, authorityBinding.privateKey).signatureBase64,
  };
}

function implementationAuthorityBinding(profile, trustedBinding, sequence, overrides = {}) {
  const binding = trustedBinding.binding;
  const payload = {
    schemaVersion: 1,
    contractVersion: "implementation-authority.v1",
    authorityKind: "wheels_up",
    authorityRef: `authority:${profile.missionId}:1`,
    missionId: profile.missionId,
    subjectId: profile.subjectId,
    seatId: "may",
    missionRevisionId: profile.revisionId,
    artifactRevisionId: FIXED_HEAD_REVISION,
    repositoryId: "repository:issue-181",
    canonicalWritableRoot: "/workspace/repository",
    branch: "main",
    baseRevision: "sha256:base_issue_181",
    headRevision: FIXED_HEAD_REVISION,
    modelId: "model:may",
    approvedRelativePaths: ["docs", "src"],
    approvedActionIds: ["edit:implementation", "read:issue"],
    approvedEffectClasses: ["behavioral_implementation", "verification"],
    approvedEffectKeys: ["effect:implementation", "effect:validation"],
    approvedCapabilities: ["filesystem_write", "github_issues"],
    validationCommandIds: ["validation:lint", "validation:test"],
    journalSequence: sequence,
    humanPrincipalId: binding.humanPrincipalId,
    humanBindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `source:implementation-authority:${sequence}`,
    evidenceRef: `evidence:implementation-authority:${sequence}`,
    timestamp: { value: `2026-07-29T15:${String(sequence).padStart(2, "0")}:00Z`, provenance: "humanRecorded" },
    ...overrides,
  };
  return signPayload(payload, trustedBinding.privateKey);
}

function implementationAuthorityRevocation(authorityEntry, trustedBinding, sequence, previousSequence, overrides = {}) {
  const binding = trustedBinding.binding;
  const payload = {
    schemaVersion: 1,
    contractVersion: "implementation-authority.v1",
    authorityRef: authorityEntry.payload.authorityRef,
    authorityDigest: computeImplementationAuthorityDigest(authorityEntry.payload),
    authoritySequence: authorityEntry.payload.journalSequence,
    missionId: authorityEntry.payload.missionId,
    subjectId: authorityEntry.payload.subjectId,
    missionRevisionId: authorityEntry.payload.missionRevisionId,
    previousJournalSequence: previousSequence,
    journalSequence: sequence,
    humanPrincipalId: binding.humanPrincipalId,
    humanBindingId: binding.bindingId,
    signingKeyRef: binding.signingKeyRef,
    sourceRef: `source:implementation-authority-revocation:${sequence}`,
    timestamp: { value: `2026-07-29T15:${String(sequence).padStart(2, "0")}:00Z`, provenance: "humanRecorded" },
    ...overrides,
  };
  return signPayload(payload, trustedBinding.privateKey);
}

function bindingRecord(profile, authorityPayload, sequence, overrides = {}) {
  const scope = {
    actionIds: ["edit:implementation", "read:issue"],
    effectClasses: ["behavioral_implementation", "verification"],
    effectKeys: ["effect:implementation", "effect:validation"],
    capabilities: ["filesystem_write", "github_issues"],
  };
  return {
    bindingSchemaVersion: 1,
    bindingId: `binding:${profile.missionId}:may`,
    bindingVersion: 1,
    missionId: profile.missionId,
    subjectId: profile.subjectId,
    missionRevisionId: profile.revisionId,
    seatId: "may",
    reasoningRuntimeId: "runtime:may",
    toolExecutorId: "tool:executor",
    repositoryId: authorityPayload.repositoryId,
    canonicalWritableRoot: authorityPayload.canonicalWritableRoot,
    branch: authorityPayload.branch,
    artifactRevisionId: authorityPayload.artifactRevisionId,
    recordedAtSequence: sequence,
    activeThroughSequence: null,
    lifecycleState: "active",
    approvedScope: {
      ...scope,
      ...overrides.approvedScope ? overrides.approvedScope : {},
    },
    coulsonAuthorizationRef: "authorization:runtime-binding:1",
    ...overrides,
  };
}

function schema9BindingWrapper(profile, authorityPayload, binding, overrides = {}) {
  return {
    schemaVersion: 1,
    binding,
    implementationAuthorityRef: authorityPayload.authorityRef,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(authorityPayload),
    implementationAuthoritySequence: authorityPayload.journalSequence,
    approvedRelativePaths: [...authorityPayload.approvedRelativePaths],
    validationCommandIds: [...authorityPayload.validationCommandIds],
    modelId: authorityPayload.modelId,
    baseRevision: authorityPayload.baseRevision,
    headRevision: authorityPayload.headRevision,
    ...overrides,
  };
}

function schema9BindingAuthorization(profile, binding, wrapper, trustedBinding, sequence, previousSequence, authorizationId, overrides = {}) {
  const signer = trustedBinding;
  const payload = {
    schemaVersion: 1,
    authorizationId,
    missionId: profile.missionId,
    subjectId: profile.subjectId,
    seatId: binding.seatId,
    bindingId: binding.bindingId,
    bindingVersion: binding.bindingVersion,
    priorBindingId: null,
    priorBindingVersion: null,
    bindingDigest: computeRuntimeBindingDigest(binding),
    schema9BindingDigest: computeSchema9RuntimeBindingDigest(wrapper),
    artifactRevisionId: binding.artifactRevisionId,
    decision: "approved",
    previousJournalSequence: previousSequence,
    journalSequence: sequence,
    humanPrincipalId: signer.binding.humanPrincipalId,
    humanBindingId: signer.binding.bindingId,
    signingKeyRef: signer.binding.signingKeyRef,
    sourceRef: `source:runtime-binding:${authorizationId}`,
    timestamp: { value: `2026-07-29T15:${String(sequence).padStart(2, "0")}:00Z`, provenance: "humanRecorded" },
    ...overrides,
  };
  return {
    ...signPayload(payload, signer.privateKey),
    payload,
  };
}

function replay(entries) {
  const result = replayProfileAwareMissionJournal(entries);
  assert.equal(result.state, "valid", result.errors?.join(" "));
  return result.value;
}

function createProfileAwareFixture(options = {}) {
  const profile = missionBrief(options.profileId ?? "standard", options.includeDaisy === true);
  const trusted = authoritySigner();
  const writableRoot = options.writableRoot ?? "/workspace/repository";
  const entries = [createProfileAwareMissionBegunEntry(profile, [trusted.binding])];
  let projection = replay(entries);

  const authorizationRequirement = projection.requirements.find(({ evidenceKind }) => evidenceKind === "mission_authorization");
  const authEvidence = governanceEvidence(trusted, projection, authorizationRequirement, 1);
  entries.push({
    schemaVersion: 9,
    entryId: `entry:${profile.missionId}:1`,
    missionId: profile.missionId,
    sequence: 1,
    type: "governance.decided",
    timestamp: authEvidence.payload.timestamp,
    payload: { evidence: authEvidence },
  });
  projection = replay(entries);

  let authority;
  if (options.withAuthority !== false) {
    authority = implementationAuthorityBinding(profile, trusted, 2, {
      canonicalWritableRoot: writableRoot,
      ...options.authorityOverrides,
    });
    entries.push(createProfileAwareImplementationAuthorityEntryV1({ projection, trustedBindings: [trusted.binding], authority }));
    projection = replay(entries);
  }

  let binding;
  let wrapper;
  let authorization;
  if (options.withBinding !== false && authority) {
    const sequence = projection.lastSequence + 1;
    binding = bindingRecord(profile, authority.payload, sequence, options.bindingOverrides);
    wrapper = schema9BindingWrapper(profile, authority.payload, binding, options.wrapperOverrides);
    authorization = schema9BindingAuthorization(
      profile,
      binding,
      wrapper,
      trusted,
      sequence,
      sequence - 1,
      binding.coulsonAuthorizationRef,
      options.authorizationOverrides,
    );
    entries.push(createProfileAwareRuntimeBindingRecordedEntryV1({
      projection,
      trustedBindings: [trusted.binding],
      binding: wrapper,
      authorization,
    }));
    projection = replay(entries);
  }

  if (options.withRevocation && authority) {
    const sequence = projection.lastSequence + 1;
    const revocation = implementationAuthorityRevocation(authority, trusted, sequence, sequence - 1);
    entries.push(createProfileAwareImplementationAuthorityRevocationEntryV1({
      projection,
      trustedBindings: [trusted.binding],
      revocation,
    }));
    projection = replay(entries);
  }

  return { profile, trusted, authority, binding, wrapper, authorization, entries, projection };
}

function permissionPlanFromProjection(projection, overrides = {}) {
  return {
    runnerContractVersion: 1,
    missionId: projection.missionId,
    subjectId: projection.brief.subjectId,
    revisionId: projection.brief.revisionId,
    evaluatedThroughSequence: projection.lastSequence,
    seatId: "may",
    activatedModes: [],
    cycleId: `cycle:${projection.missionId}:permission`,
    actionId: "implement-runner-seam",
    effectClass: "behavioral_implementation",
    effectKey: `effect:${projection.missionId}:runner-seam`,
    validationId: `validation:${projection.missionId}:runner-seam`,
    stopCondition: "after_one_cycle",
    ...overrides,
  };
}

function permissionPlan(id) {
  return {
    runnerContractVersion: 1,
    missionId: id.missionId,
    subjectId: id.subjectId,
    revisionId: id.revisionId,
    evaluatedThroughSequence: id.evaluatedThroughSequence,
    seatId: "may",
    activatedModes: [],
    cycleId: `cycle:${id.missionId}:permission`,
    actionId: "implement-runner-seam",
    effectClass: "behavioral_implementation",
    effectKey: `effect:${id.missionId}:runner-seam`,
    validationId: `validation:${id.missionId}:runner-seam`,
    stopCondition: "after_one_cycle",
  };
}

async function createGitRepository() {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-schema9-permission-"));
  await writeFile(join(repositoryRoot, "fixture.txt"), "# fixture", "utf8");
  await execFile("git", ["-C", repositoryRoot, "init", "-b", "main"], { encoding: "utf8" });
  await execFile("git", ["-C", repositoryRoot, "add", "fixture.txt"], { encoding: "utf8" });
  await execFile("git", ["-C", repositoryRoot, "-c", "user.name=shield", "-c", "user.email=shield@example.com", "commit", "-m", "schema9 fixture"], { encoding: "utf8" });
  return realpath(repositoryRoot);
}

async function writeJournal(repositoryRoot, missionId, entries, configuredJournalPath = ".shield/journals") {
  const pathsResult = resolveSupervisedMissionPaths(repositoryRoot, configuredJournalPath, missionId);
  assert.equal(pathsResult.state, "valid");
  await mkdir(pathsResult.value.root, { recursive: true });
  const text = entries.map((entry) => `${JSON.stringify(entry)}\n`).join("");
  await writeFile(pathsResult.value.journalPath, text, "utf8");
  return pathsResult.value.journalPath;
}

async function appendJournal(journalPath, entry) {
  await writeFile(journalPath, `${JSON.stringify(entry)}\n`, { flag: "a", encoding: "utf8" });
}

function makePermissionInput(args) {
  return {
    repositoryRoot: args.repositoryRoot,
    configuredJournalPath: ".shield/journals",
    missionId: args.missionId,
    expectedDecisionId: args.expectedDecisionId,
    plan: args.plan,
    hostId: "host:schema9",
    trustedHostOps: args.hostOps,
  };
}

function makeGitHostOps({
  repositoryRoot,
  topLevel = repositoryRoot,
  accessOk = true,
  branchFactory = () => "main",
  headFactory = async () => "sha256:head",
  now = () => new Date().toISOString(),
  probeCapability = async () => true,
}) {
  return {
    realpath: (path) => realpath(path),
    access: async (path) => {
      if (!accessOk)
        throw new Error("unwritable");
      await fsAccess(path, constants.W_OK | constants.R_OK);
    },
    now,
    execFile: async (_command, args) => {
      const command = args.join(" ");
      if (command.endsWith("rev-parse --show-toplevel")) {
        return `${topLevel}\n`;
      }
      if (command.endsWith("rev-parse --abbrev-ref HEAD")) {
        return `${branchFactory()}\n`;
      }
      if (command.endsWith("rev-parse HEAD")) {
        const head = await headFactory();
        return `${head}\n`;
      }
      if (command.endsWith("worktree list --porcelain")) {
        return `worktree ${repositoryRoot}\nHEAD ${await headFactory()}\nbranch refs/heads/${branchFactory()}\n\n`;
      }
      throw new Error(`Unsupported command: ${command}`);
    },
    probeCapability,
  };
}

async function createDaisyPermissionFixture(repositoryRoot) {
  const fixture = createProfileAwareFixture({ writableRoot: repositoryRoot, includeDaisy: true });
  const durableArtifactRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-daisy-artifacts-")));
  const authoritySequence = fixture.projection.lastSequence + 1;
  const authorityPayload = {
    schemaVersion: 1,
    contractVersion: "daisy-coordination-authority.v1",
    authorityKind: "daisy_feature_flight_coordination",
    authorityRef: `authority:${fixture.profile.missionId}:daisy:${authoritySequence}`,
    missionId: fixture.profile.missionId,
    subjectId: fixture.profile.subjectId,
    missionRevisionId: fixture.profile.revisionId,
    evaluatedThroughSequence: fixture.projection.lastSequence,
    repositoryId: "repository:issue-181",
    canonicalRepositoryRoot: repositoryRoot,
    branch: "main",
    headRevision: FIXED_HEAD_REVISION,
    seatId: "daisy",
    actionId: "action:feature-flight.daisy.reconnaissance",
    effectClass: "coordination",
    effectKey: "effect:daisy:reconnaissance",
    capabilityClass: "read_only_coordination",
    approvedReadRoots: [repositoryRoot],
    durableArtifactRoot,
    issuedAt: { value: `2026-07-29T15:${String(authoritySequence).padStart(2, "0")}:00Z`, provenance: "humanRecorded" },
    signingKeyRef: fixture.trusted.binding.signingKeyRef,
  };
  const authority = {
    ...signPayload(authorityPayload, fixture.trusted.privateKey),
    authorityDigest: computeDaisyCoordinationAuthorityDigest(authorityPayload),
  };
  fixture.entries.push(createProfileAwareDaisyCoordinationAuthorityEntryV1({
    projection: fixture.projection,
    trustedBindings: [fixture.trusted.binding],
    authority,
  }));
  fixture.projection = replay(fixture.entries);
  const bindingSequence = fixture.projection.lastSequence + 1;
  const authorizationId = `authorization:${fixture.profile.missionId}:daisy:${bindingSequence}`;
  const binding = {
    schemaVersion: 1,
    contractVersion: "daisy-coordination-runtime-binding.v1",
    bindingId: `binding:${fixture.profile.missionId}:daisy`,
    bindingVersion: 1,
    priorBindingId: null,
    priorBindingVersion: null,
    missionId: fixture.profile.missionId,
    subjectId: fixture.profile.subjectId,
    missionRevisionId: fixture.profile.revisionId,
    seatId: "daisy",
    runtimeId: "runtime:daisy:permission",
    modelId: "model:daisy:permission",
    executorId: "executor:daisy:permission",
    actionId: authorityPayload.actionId,
    effectClass: authorityPayload.effectClass,
    effectKey: authorityPayload.effectKey,
    capabilityClass: authorityPayload.capabilityClass,
    repositoryId: authorityPayload.repositoryId,
    canonicalRepositoryRoot: repositoryRoot,
    branch: "main",
    headRevision: FIXED_HEAD_REVISION,
    durableArtifactRoot,
    authorityRef: authorityPayload.authorityRef,
    authorityDigest: authority.authorityDigest,
    authoritySequence,
    effectiveSequence: bindingSequence,
    lifecycleState: "active",
    coulsonAuthorizationRef: authorizationId,
  };
  const authorizationPayload = {
    schemaVersion: 1,
    contractVersion: "daisy-coordination-runtime-binding-authorization.v1",
    authorizationId,
    missionId: fixture.profile.missionId,
    subjectId: fixture.profile.subjectId,
    seatId: "daisy",
    bindingId: binding.bindingId,
    bindingVersion: 1,
    priorBindingId: null,
    priorBindingVersion: null,
    bindingDigest: computeDaisyCoordinationRuntimeBindingDigest(binding),
    authorityRef: authorityPayload.authorityRef,
    authorityDigest: authority.authorityDigest,
    authoritySequence,
    decision: "approved",
    previousJournalSequence: bindingSequence - 1,
    journalSequence: bindingSequence,
    signingKeyRef: fixture.trusted.binding.signingKeyRef,
    sourceRef: `source:daisy:permission:${bindingSequence}`,
    issuedAt: { value: `2026-07-29T15:${String(bindingSequence).padStart(2, "0")}:00Z`, provenance: "humanRecorded" },
  };
  fixture.entries.push(createProfileAwareDaisyRuntimeBindingEntryV1({
    projection: fixture.projection,
    trustedBindings: [fixture.trusted.binding],
    binding,
    authorization: signPayload(authorizationPayload, fixture.trusted.privateKey),
  }));
  fixture.projection = replay(fixture.entries);
  return { ...fixture, durableArtifactRoot };
}

test("Daisy coordination permission returns its immutable exact authority and durable-root binding", async () => {
  const repositoryRoot = await createGitRepository();
  const fixture = await createDaisyPermissionFixture(repositoryRoot);
  await writeJournal(repositoryRoot, fixture.profile.missionId, fixture.entries);
  const plan = permissionPlanFromProjection(fixture.projection, {
    seatId: "daisy",
    actionId: "action:feature-flight.daisy.reconnaissance",
    effectClass: "coordination",
    effectKey: "effect:daisy:reconnaissance",
    validationId: "validation:feature-flight.daisy-result-v1",
  });
  const result = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot,
    missionId: fixture.profile.missionId,
    expectedDecisionId: "decision:schema9:daisy-ready",
    plan,
    hostOps: makeGitHostOps({ repositoryRoot, headFactory: () => FIXED_HEAD_REVISION }),
  }));
  assert.equal(result.state, "ready");
  assert.equal(result.context.activeBindings[0].seatId, "daisy");
  assert.equal(result.context.canonicalWritableRoot, fixture.durableArtifactRoot);
  assert.deepEqual(result.context.requiredCapabilities, ["read_only_coordination"]);
  assert.equal(result.daisyCoordination.authorityRef, fixture.projection.daisyCoordinationAuthority.authorityRef);
  assert.equal(result.daisyCoordination.durableArtifactRoot, fixture.durableArtifactRoot);
  assert.equal(Object.isFrozen(result.daisyCoordination), true);
  assert.equal(Object.isFrozen(result.daisyCoordination.approvedReadRoots), true);
});

test("Daisy permission reobserves canonical roots and worktrees after probes and fails closed on drift or faults", async () => {
  const repositoryRoot = await createGitRepository();
  const otherWorktreeRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-daisy-other-worktree-")));
  const fixture = await createDaisyPermissionFixture(repositoryRoot);
  await writeJournal(repositoryRoot, fixture.profile.missionId, fixture.entries);
  const plan = permissionPlanFromProjection(fixture.projection, {
    seatId: "daisy",
    actionId: "action:feature-flight.daisy.reconnaissance",
    effectClass: "coordination",
    effectKey: "effect:daisy:reconnaissance",
    validationId: "validation:feature-flight.daisy-result-v1",
  });

  for (const scenario of ["inventory-drift", "observer-fault"]) {
    let probeCalls = 0;
    let worktreeCalls = 0;
    let postProbeReobservation = false;
    const hostOps = makeGitHostOps({
      repositoryRoot,
      headFactory: () => FIXED_HEAD_REVISION,
      probeCapability: async () => { probeCalls += 1; return true; },
    });
    const baseExecFile = hostOps.execFile;
    hostOps.execFile = async (...args) => {
      if (args[1].join(" ").endsWith("worktree list --porcelain")) {
        worktreeCalls += 1;
        if (worktreeCalls === 2) {
          postProbeReobservation = probeCalls > 0;
          if (scenario === "observer-fault") throw new Error("injected post-probe worktree fault");
          return `worktree ${repositoryRoot}\nHEAD ${FIXED_HEAD_REVISION}\nbranch refs/heads/main\n\nworktree ${otherWorktreeRoot}\nHEAD ${FIXED_HEAD_REVISION}\nbranch refs/heads/other\n\n`;
        }
      }
      return baseExecFile(...args);
    };
    const result = await loadSchema9PermissionContextV1(makePermissionInput({
      repositoryRoot,
      missionId: fixture.profile.missionId,
      expectedDecisionId: `decision:schema9:daisy-${scenario}`,
      plan,
      hostOps,
    }));
    assert.equal(result.state, "blocked", scenario);
    assert.equal(result.code, "root_mismatch", scenario);
    assert.equal(worktreeCalls, 2, scenario);
    assert.equal(postProbeReobservation, true, scenario);
  }
});

test("schema9 permission context load is ready on valid replay with all required bindings and capabilities", async () => {
  const repositoryRoot = await createGitRepository();
  const fixture = createProfileAwareFixture({ writableRoot: repositoryRoot });
  await writeJournal(repositoryRoot, fixture.profile.missionId, fixture.entries);
  const result = await loadSchema9PermissionContextV1(
    makePermissionInput({
      repositoryRoot,
      missionId: fixture.profile.missionId,
      expectedDecisionId: "decision:schema9:ready",
      plan: permissionPlanFromProjection(fixture.projection),
      hostOps: makeGitHostOps({
        repositoryRoot,
        topLevel: repositoryRoot,
        headFactory: () => FIXED_HEAD_REVISION,
      }),
    }),
  );
  assert.equal(result.state, "ready");
  assert.deepEqual(Object.keys(result), ["state", "context"]);
  assert.equal(Object.hasOwn(result, "daisyCoordination"), false);
  const context = result.context;
  const expectedCapabilities = ["filesystem_write", "github_issues"];
  assert.deepEqual(context.requiredCapabilities, expectedCapabilities);
  assert.equal(context.attestations.length, 4);
  assert.equal(context.attestations.filter((attestation) => attestation.kind === "capability").length, 2);
  assert.equal(context.attestations.every((attestation) => attestation.expiresAt === attestation.observedAt), true);
});

test("May replay, dispatch projection, permission context, and permission artifact retain fixed normalized canonical bytes", async (context) => {
  const physicalRepositoryRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-team-system-may-golden-")));
  context.after(() => rm(physicalRepositoryRoot, { recursive: true, force: true }));
  const fixture = createProfileAwareFixture({ writableRoot: physicalRepositoryRoot });
  await writeJournal(physicalRepositoryRoot, fixture.profile.missionId, fixture.entries);
  const plan = permissionPlanFromProjection(fixture.projection, {
    actionId: "edit:implementation",
    effectKey: "effect:implementation",
    validationId: "validation:lint",
  });
  const hostOps = {
    realpath: (path) => realpath(path),
    access: async (path) => {
      assert.equal(path, physicalRepositoryRoot);
      await fsAccess(path, constants.W_OK | constants.R_OK);
    },
    now: () => "2026-08-10T18:00:00Z",
    execFile: async (_command, args) => {
      const command = args.join(" ");
      if (command.endsWith("rev-parse --show-toplevel")) return `${physicalRepositoryRoot}\n`;
      if (command.endsWith("rev-parse --abbrev-ref HEAD")) return "main\n";
      if (command.endsWith("rev-parse HEAD")) return `${FIXED_HEAD_REVISION}\n`;
      throw new Error(`Unsupported command: ${command}`);
    },
    probeCapability: async () => true,
  };
  const dispatch = await loadSchema9SeatDispatchProjectionV1({
    purpose: "specialist_dispatch",
    repositoryRoot: physicalRepositoryRoot,
    configuredJournalPath: ".shield/journals",
    missionId: fixture.profile.missionId,
    expectedSubjectId: fixture.profile.subjectId,
    expectedMissionRevisionId: fixture.profile.revisionId,
    expectedEvaluatedThroughSequence: fixture.projection.lastSequence,
    plan,
    trustedHostOps: { realpath: hostOps.realpath, execFile: hostOps.execFile },
  });
  assert.equal(dispatch.state, "ready", dispatch.errors?.join(" "));
  const permission = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot: physicalRepositoryRoot,
    missionId: fixture.profile.missionId,
    expectedDecisionId: "decision:schema9:may-golden",
    plan,
    hostOps,
  }));
  assert.equal(permission.state, "ready", permission.errors?.join(" "));
  const authorize = createPermissionAuthorizer({
    ledgerId: "ledger:schema9:may-golden",
    getContext: () => permission.context,
    appendIfAbsent: (record) => ({
      schemaVersion: 1,
      ledgerId: record.ledgerId,
      recordId: record.recordId,
      decisionId: record.decisionId,
      digest: record.digest,
      appended: true,
      ledgerSequence: 0,
    }),
  });
  const decision = await authorize(plan);
  assert.equal(decision.outcome, "allow");
  assert.equal(dispatch.projection.repositoryObservations.every(({ canonicalRoot }) => canonicalRoot === physicalRepositoryRoot), true);
  assert.equal(permission.context.attestations.every(({ canonicalWritableRoot }) => canonicalWritableRoot === physicalRepositoryRoot), true);
  const goldenRepositoryRoots = [physicalRepositoryRoot];
  assert.deepEqual({
    replay: canonicalSha256(normalizeGoldenRepositoryEvidence(fixture.projection, goldenRepositoryRoots)),
    dispatch: canonicalSha256(normalizeGoldenRepositoryEvidence(dispatch.projection, goldenRepositoryRoots)),
    permissionContext: canonicalSha256(normalizeGoldenRepositoryEvidence(permission.context, goldenRepositoryRoots)),
    permissionArtifact: canonicalSha256(normalizeGoldenRepositoryEvidence(decision.authorizationArtifact, goldenRepositoryRoots)),
  }, {
    replay: "34316675e7f81895043c5bda2cd5cf10d0fa6f3c3443920caf708d86c5cbd5d4",
    dispatch: "8e49917e3d2fdbd35446c1ffdcec30d1015529d3bc72c831e04fc73d7fc60378",
    permissionContext: "d18c588ca43ec25466205e13ba7cae32945a71559ee2b1aa5159a1aa9f61a931",
    permissionArtifact: "45a76898719b46280df8fb1a3ed364f4a98e6e21d2fb3295e2b68f147e2d6a93",
  });
});

test("production filesystem and git observers load the exact live repository", async () => {
  const repositoryRoot = await createGitRepository();
  const { stdout } = await execFile("git", ["-C", repositoryRoot, "rev-parse", "HEAD"], { encoding: "utf8" });
  const head = stdout.trim();
  const fixture = createProfileAwareFixture({
    writableRoot: repositoryRoot,
    authorityOverrides: {
      artifactRevisionId: head,
      baseRevision: "cccccccccccccccccccccccccccccccccccccccc",
      headRevision: head,
    },
  });
  await writeJournal(repositoryRoot, fixture.profile.missionId, fixture.entries);
  const result = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot,
    missionId: fixture.profile.missionId,
    expectedDecisionId: "decision:schema9:production-observers",
    plan: permissionPlanFromProjection(fixture.projection),
    hostOps: {
      probeCapability: async () => true,
      now: () => "2026-07-29T20:00:00Z",
    },
  }));
  assert.equal(result.state, "ready");
  assert.equal(result.context.artifactRevisionId, head);
  assert.equal(result.context.canonicalWritableRoot, repositoryRoot);
  assert.equal(result.context.branch, "main");

  const previousGitDir = process.env.GIT_DIR;
  const previousGitWorkTree = process.env.GIT_WORK_TREE;
  process.env.GIT_DIR = join(repositoryRoot, "poisoned-git-dir");
  process.env.GIT_WORK_TREE = join(repositoryRoot, "poisoned-work-tree");
  try {
    const poisonedEnvironment = await loadSchema9PermissionContextV1(makePermissionInput({
      repositoryRoot,
      missionId: fixture.profile.missionId,
      expectedDecisionId: "decision:schema9:poisoned-environment",
      plan: permissionPlanFromProjection(fixture.projection),
      hostOps: {
        probeCapability: async () => true,
        now: () => "2026-07-29T20:00:01Z",
      },
    }));
    assert.equal(poisonedEnvironment.state, "ready");
  } finally {
    if (previousGitDir === undefined) delete process.env.GIT_DIR;
    else process.env.GIT_DIR = previousGitDir;
    if (previousGitWorkTree === undefined) delete process.env.GIT_WORK_TREE;
    else process.env.GIT_WORK_TREE = previousGitWorkTree;
  }
});

test("schema9 permission context still ready when runtime binding advertises no capabilities", async () => {
  const repositoryRoot = await createGitRepository();
  const fixture = createProfileAwareFixture({
    writableRoot: repositoryRoot,
    bindingOverrides: {
      approvedScope: {
        actionIds: ["edit:implementation", "read:issue"],
        effectClasses: ["behavioral_implementation", "verification"],
        effectKeys: ["effect:implementation", "effect:validation"],
        capabilities: [],
      },
    },
  });
  await writeJournal(repositoryRoot, fixture.profile.missionId, fixture.entries);
  const result = await loadSchema9PermissionContextV1(
    makePermissionInput({
      repositoryRoot,
      missionId: fixture.profile.missionId,
      expectedDecisionId: "decision:schema9:empty",
      plan: permissionPlanFromProjection(fixture.projection),
      hostOps: makeGitHostOps({
        repositoryRoot,
        topLevel: repositoryRoot,
        headFactory: () => FIXED_HEAD_REVISION,
      }),
    }),
  );
  assert.equal(result.state, "ready");
  assert.equal(result.context.requiredCapabilities.length, 0);
  assert.equal(result.context.attestations.length, 2);
  assert.equal(result.context.attestations.some((attestation) => attestation.kind === "capability"), false);
});

test("legacy/supervised, missing, and malformed journals map to loader block outcomes", async () => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "shield-schema9-journal-"));
  const missionId = "mission:schema9-legacy";
  const config = ".shield/journals";
  const pathsResult = resolveSupervisedMissionPaths(repositoryRoot, config, missionId);
  assert.equal(pathsResult.state, "valid");
  await mkdir(pathsResult.value.root, { recursive: true });
  const { publicKey } = generateKeyPairSync("ed25519");
  const publicKeySpkiBase64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const legacyBrief = createSupervisedMissionBrief({
    schemaVersion: 1,
    missionId,
    objective: "Prove valid legacy journals cannot become schema-9 authority.",
    subjectId: "issue:schema9-legacy",
    riskFlags,
    participants: [{ seatId: "coulson" }, { seatId: "fitz" }],
    activatedModes: [],
    requireSimmons: false,
    createdAt: { value: "2026-07-29T14:00:00Z", provenance: "humanRecorded" },
  });
  const legacyEntry = createMissionBegunEntry(legacyBrief, [{
    schemaVersion: 1,
    bindingId: "binding:coulson:legacy",
    humanPrincipalId: "human:coulson:legacy",
    seatId: "coulson",
    missionScope: "*",
    signingKeyRef: computeEd25519SigningKeyRef(publicKeySpkiBase64),
    publicKeySpkiBase64,
    validFromSequence: 0,
    validThroughSequence: null,
    attestedBy: "repository-policy:maintainer",
    provenanceRef: "repository-config:coulson",
  }]);
  await writeFile(pathsResult.value.journalPath, `${JSON.stringify(legacyEntry)}\n`, "utf8");

  const missingPlan = permissionPlan({
    missionId,
    subjectId: "issue:schema9-legacy",
    revisionId: legacyBrief.revisionId,
    evaluatedThroughSequence: 0,
  });
  const legacy = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot,
    missionId,
    expectedDecisionId: "decision:schema9:legacy",
    plan: missingPlan,
    hostOps: makeGitHostOps({ repositoryRoot }),
  }));
  assert.equal(legacy.state, "blocked");
  assert.equal(legacy.code, "schema_unsupported");

  const missingRepoRoot = await mkdtemp(join(tmpdir(), "shield-schema9-journal-missing-"));
  const missing = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot: missingRepoRoot,
    missionId,
    expectedDecisionId: "decision:schema9:missing",
    plan: missingPlan,
    hostOps: makeGitHostOps({ repositoryRoot }),
  }));
  assert.equal(missing.state, "blocked");
  assert.equal(missing.code, "journal_invalid");

  await writeFile(pathsResult.value.journalPath, "{malformed-json", "utf8");
  const malformed = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot,
    missionId,
    expectedDecisionId: "decision:schema9:malformed",
    plan: missingPlan,
    hostOps: makeGitHostOps({ repositoryRoot }),
  }));
  assert.equal(malformed.state, "blocked");
  assert.equal(malformed.code, "journal_invalid");
});

test("missing authority and revoked authority are blocked explicitly", async () => {
  const repositoryRoot = await createGitRepository();

  const missingAuthority = createProfileAwareFixture({ withAuthority: false, writableRoot: repositoryRoot });
  await writeJournal(repositoryRoot, missingAuthority.profile.missionId, missingAuthority.entries);
  const missingPlan = permissionPlanFromProjection({
    missionId: missingAuthority.profile.missionId,
    brief: { subjectId: missingAuthority.profile.subjectId, revisionId: missingAuthority.profile.revisionId },
    lastSequence: 1,
  });
  const missingAuthorityResult = await loadSchema9PermissionContextV1(
    makePermissionInput({
      repositoryRoot,
      missionId: missingAuthority.profile.missionId,
      expectedDecisionId: "decision:schema9:missing-authority",
      plan: missingPlan,
      hostOps: makeGitHostOps({ repositoryRoot, topLevel: repositoryRoot, headFactory: () => FIXED_HEAD_REVISION }),
    }),
  );
  assert.equal(missingAuthorityResult.state, "blocked");
  assert.equal(missingAuthorityResult.code, "authority_missing");

  const revoked = createProfileAwareFixture({ withRevocation: true, writableRoot: repositoryRoot });
  await writeJournal(repositoryRoot, revoked.profile.missionId, revoked.entries);
  const revokedPlan = permissionPlanFromProjection(revoked.projection);
  const revokedResult = await loadSchema9PermissionContextV1(
    makePermissionInput({
      repositoryRoot,
      missionId: revoked.profile.missionId,
      expectedDecisionId: "decision:schema9:revoked-authority",
      plan: revokedPlan,
      hostOps: makeGitHostOps({ repositoryRoot, topLevel: repositoryRoot, headFactory: () => FIXED_HEAD_REVISION }),
    }),
  );
  assert.equal(revokedResult.state, "blocked");
  assert.equal(revokedResult.code, "authority_inactive");
});

test("missing, ambiguous, and stale binding variants are blocked", async () => {
  const repositoryRoot = await createGitRepository();
  const missingBindingFixture = createProfileAwareFixture({ withBinding: false, writableRoot: repositoryRoot });
  await writeJournal(repositoryRoot, missingBindingFixture.profile.missionId, missingBindingFixture.entries);
  const missingBindingPlan = permissionPlanFromProjection({
    missionId: missingBindingFixture.profile.missionId,
    brief: { subjectId: missingBindingFixture.profile.subjectId, revisionId: missingBindingFixture.profile.revisionId },
    lastSequence: 2,
  });
  const missingBindingResult = await loadSchema9PermissionContextV1(
    makePermissionInput({
      repositoryRoot,
      missionId: missingBindingFixture.profile.missionId,
      expectedDecisionId: "decision:schema9:missing-binding",
      plan: missingBindingPlan,
      hostOps: makeGitHostOps({ repositoryRoot, topLevel: repositoryRoot, headFactory: () => FIXED_HEAD_REVISION }),
    }),
  );
  assert.equal(missingBindingResult.state, "blocked");
  assert.equal(missingBindingResult.code, "binding_missing");

  const ambiguousBindingFixture = createProfileAwareFixture({ withBinding: false, writableRoot: repositoryRoot });
  assert.equal(ambiguousBindingFixture.authority !== null, true);
  let ambiguousEntries = [...ambiguousBindingFixture.entries];
  const ambiguousFirstSequence = ambiguousBindingFixture.projection.lastSequence + 1;
  const firstBinding = bindingRecord(
    ambiguousBindingFixture.profile,
    ambiguousBindingFixture.authority.payload,
    ambiguousFirstSequence,
    {
      bindingId: "binding:ambiguous:1",
      coulsonAuthorizationRef: "authorization:runtime-binding:ambiguous-1",
    approvedScope: {
        actionIds: ["edit:implementation", "read:issue"],
        effectClasses: ["behavioral_implementation", "verification"],
        effectKeys: ["effect:implementation", "effect:validation"],
        capabilities: ["filesystem_write", "github_issues"],
    },
  });
  const firstBindingWrapper = schema9BindingWrapper(
    ambiguousBindingFixture.profile,
    ambiguousBindingFixture.authority.payload,
    firstBinding,
    {
      approvedRelativePaths: ["docs", "src"],
      validationCommandIds: ["validation:lint", "validation:test"],
    },
  );
  const firstBindingAuthorization = schema9BindingAuthorization(
    ambiguousBindingFixture.profile,
    firstBinding,
    firstBindingWrapper,
    ambiguousBindingFixture.trusted,
    ambiguousFirstSequence,
    ambiguousBindingFixture.projection.lastSequence,
    "authorization:runtime-binding:ambiguous-1",
  );
  ambiguousEntries.push(
    createProfileAwareRuntimeBindingRecordedEntryV1({
      projection: ambiguousBindingFixture.projection,
      trustedBindings: [ambiguousBindingFixture.trusted.binding],
      binding: firstBindingWrapper,
      authorization: firstBindingAuthorization,
    }),
  );
  const firstBindingProjection = replay(ambiguousEntries);
  ambiguousEntries.push(structuredClone(ambiguousEntries.at(-1)));
  await writeJournal(repositoryRoot, ambiguousBindingFixture.profile.missionId, ambiguousEntries);
  const ambiguousPlan = permissionPlanFromProjection(firstBindingProjection);
  const ambiguousResult = await loadSchema9PermissionContextV1(
    makePermissionInput({
      repositoryRoot,
      missionId: ambiguousBindingFixture.profile.missionId,
      expectedDecisionId: "decision:schema9:ambiguous-binding",
      plan: ambiguousPlan,
      hostOps: makeGitHostOps({ repositoryRoot, topLevel: repositoryRoot, headFactory: () => FIXED_HEAD_REVISION }),
    }),
  );
  assert.equal(ambiguousResult.state, "blocked");
  assert.equal(ambiguousResult.code, "journal_invalid");

  const staleBindingFixture = createProfileAwareFixture({
    writableRoot: repositoryRoot,
    authorityOverrides: { artifactRevisionId: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
  });
  await writeJournal(repositoryRoot, staleBindingFixture.profile.missionId, staleBindingFixture.entries);
  const staleBindingPlan = permissionPlanFromProjection(staleBindingFixture.projection);
  const staleBindingResult = await loadSchema9PermissionContextV1(
    makePermissionInput({
      repositoryRoot,
      missionId: staleBindingFixture.profile.missionId,
      expectedDecisionId: "decision:schema9:stale-binding",
      plan: staleBindingPlan,
      hostOps: makeGitHostOps({ repositoryRoot, topLevel: repositoryRoot, headFactory: () => FIXED_HEAD_REVISION }),
    }),
  );
  assert.equal(staleBindingResult.state, "blocked");
  assert.equal(staleBindingResult.code, "authority_inactive");
});

test("wrong root, wrong branch, detached head, and wrong head are blocked", async () => {
  const repositoryRoot = await createGitRepository();
  const fixture = createProfileAwareFixture({ writableRoot: repositoryRoot });
  await writeJournal(repositoryRoot, fixture.profile.missionId, fixture.entries);
  const plan = permissionPlanFromProjection(fixture.projection);

  const aliasParent = await mkdtemp(join(tmpdir(), "shield-schema9-root-alias-"));
  const aliasRoot = join(aliasParent, "repository-alias");
  await symlink(repositoryRoot, aliasRoot, "dir");
  const aliasMismatch = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot: aliasRoot,
    missionId: fixture.profile.missionId,
    expectedDecisionId: "decision:schema9:root-alias",
    plan,
    hostOps: {
      probeCapability: async () => true,
      now: () => "2026-07-29T20:00:00Z",
    },
  }));
  assert.equal(aliasMismatch.state, "blocked");
  assert.equal(aliasMismatch.code, "root_mismatch");

  const nested = join(repositoryRoot, "nested");
  await mkdir(nested, { recursive: true });
  await writeJournal(nested, fixture.profile.missionId, fixture.entries);
  const rootMismatch = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot: nested,
    missionId: fixture.profile.missionId,
    expectedDecisionId: "decision:schema9:root",
    plan,
    hostOps: makeGitHostOps({ repositoryRoot: nested, topLevel: repositoryRoot, headFactory: () => FIXED_HEAD_REVISION, branchFactory: () => "main" }),
  }));
  assert.equal(rootMismatch.state, "blocked");
  assert.equal(rootMismatch.code, "root_mismatch");

  const wrongBranch = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot,
    missionId: fixture.profile.missionId,
    expectedDecisionId: "decision:schema9:branch",
    plan,
    hostOps: makeGitHostOps({ repositoryRoot, topLevel: repositoryRoot, headFactory: () => FIXED_HEAD_REVISION, branchFactory: () => "release" }),
  }));
  assert.equal(wrongBranch.state, "blocked");
  assert.equal(wrongBranch.code, "branch_mismatch");

  const detached = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot,
    missionId: fixture.profile.missionId,
    expectedDecisionId: "decision:schema9:detached",
    plan,
    hostOps: makeGitHostOps({ repositoryRoot, topLevel: repositoryRoot, headFactory: () => FIXED_HEAD_REVISION, branchFactory: () => "HEAD" }),
  }));
  assert.equal(detached.state, "blocked");
  assert.equal(detached.code, "observation_failed");

  const wrongHead = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot,
    missionId: fixture.profile.missionId,
    expectedDecisionId: "decision:schema9:head",
    plan,
    hostOps: makeGitHostOps({ repositoryRoot, topLevel: repositoryRoot, headFactory: () => "sha256:wrong_head_revision", branchFactory: () => "main" }),
  }));
  assert.equal(wrongHead.state, "blocked");
  assert.equal(wrongHead.code, "head_mismatch");
});

test("capability probe can block on false capability and on unwritable root", async () => {
  const repositoryRoot = await createGitRepository();
  const fixture = createProfileAwareFixture({ writableRoot: repositoryRoot });
  await writeJournal(repositoryRoot, fixture.profile.missionId, fixture.entries);
  const plan = permissionPlanFromProjection(fixture.projection);

  const capabilityFalse = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot,
    missionId: fixture.profile.missionId,
    expectedDecisionId: "decision:schema9:capability",
    plan,
      hostOps: makeGitHostOps({
        repositoryRoot,
        topLevel: repositoryRoot,
        headFactory: () => FIXED_HEAD_REVISION,
        probeCapability: async (capability) => capability === "github_issues",
      }),
  }));
  assert.equal(capabilityFalse.state, "blocked");
  assert.equal(capabilityFalse.code, "capability_unavailable");

  const writableFailure = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot,
    missionId: fixture.profile.missionId,
    expectedDecisionId: "decision:schema9:writable",
    plan,
      hostOps: makeGitHostOps({
        repositoryRoot,
        topLevel: repositoryRoot,
        headFactory: () => FIXED_HEAD_REVISION,
        accessOk: false,
        probeCapability: async () => true,
      }),
  }));
  assert.equal(writableFailure.state, "blocked");
  assert.equal(writableFailure.code, "writability_unavailable");
});

test("capability probe can detect journal mutation between exact snapshots", async () => {
  const repositoryRoot = await createGitRepository();
  const fixture = createProfileAwareFixture({ writableRoot: repositoryRoot });
  const journalPath = await writeJournal(repositoryRoot, fixture.profile.missionId, fixture.entries);
  const plan = permissionPlanFromProjection(fixture.projection);

  let mutated = false;
  const result = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot,
    missionId: fixture.profile.missionId,
    expectedDecisionId: "decision:schema9:mutate-journal",
    plan,
      hostOps: makeGitHostOps({
        repositoryRoot,
        topLevel: repositoryRoot,
        headFactory: () => FIXED_HEAD_REVISION,
        branchFactory: () => "main",
        probeCapability: async (capability) => {
        if (!mutated) {
          mutated = true;
          await appendJournal(journalPath, {
            schemaVersion: 9,
            entryId: `entry:${fixture.profile.missionId}:4`,
            missionId: fixture.profile.missionId,
            sequence: 4,
            type: "execution.transition",
            timestamp: { value: "2026-07-29T16:00:00Z", provenance: "hostTrusted" },
            payload: { from: "not-started", to: "running" },
          });
        }
        return true;
      },
    }),
  }));
  assert.equal(result.state, "blocked");
  assert.equal(result.code, "sequence_mismatch");
});

test("git tuple mutation after capability probes is blocked by observation checks", async () => {
  const repositoryRoot = await createGitRepository();
  const fixture = createProfileAwareFixture({ writableRoot: repositoryRoot });
  await writeJournal(repositoryRoot, fixture.profile.missionId, fixture.entries);
  const plan = permissionPlanFromProjection(fixture.projection);
  let headCalls = 0;

  const result = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot,
    missionId: fixture.profile.missionId,
    expectedDecisionId: "decision:schema9:mutate-git",
    plan,
    hostOps: makeGitHostOps({
      repositoryRoot,
      topLevel: repositoryRoot,
      branchFactory: () => "main",
      headFactory: () => {
        headCalls += 1;
        return headCalls === 1 ? FIXED_HEAD_REVISION : "sha256:mutated_after_probe_head";
      },
    }),
  }));
  assert.equal(result.state, "blocked");
  assert.equal(result.code, "head_mismatch");
});

test("fresh calls produce distinct attestations while preserving zero duration", async () => {
  const repositoryRoot = await createGitRepository();
  const fixture = createProfileAwareFixture({ writableRoot: repositoryRoot });
  await writeJournal(repositoryRoot, fixture.profile.missionId, fixture.entries);
  const plan = permissionPlanFromProjection(fixture.projection);
  const ticks = ["2026-07-29T20:00:00.001Z", "2026-07-29T20:00:00.002Z"];
  let nowIndex = 0;
  const hostOps = makeGitHostOps({
    repositoryRoot,
    topLevel: repositoryRoot,
    headFactory: () => FIXED_HEAD_REVISION,
    now: () => ticks[nowIndex++],
  });

  const first = await loadSchema9PermissionContextV1(
    makePermissionInput({
      repositoryRoot,
      missionId: fixture.profile.missionId,
      expectedDecisionId: "decision:schema9:fresh-1",
      plan,
      hostOps,
    }),
  );
  const second = await loadSchema9PermissionContextV1(
    makePermissionInput({
      repositoryRoot,
      missionId: fixture.profile.missionId,
      expectedDecisionId: "decision:schema9:fresh-2",
      plan,
      hostOps,
    }),
  );
  assert.equal(first.state, "ready");
  assert.equal(second.state, "ready");
  assert.notEqual(first.context.evaluatedAt, second.context.evaluatedAt);
  assert.equal(first.context.attestations.every(({ observedAt, expiresAt }) => observedAt === expiresAt), true);
  assert.equal(second.context.attestations.every(({ observedAt, expiresAt }) => observedAt === expiresAt), true);
  assert.notEqual(first.context.attestations[0].attestationId, second.context.attestations[0].attestationId);
  assert.notEqual(first.context.attestations[3].attestationId, second.context.attestations[3].attestationId);
});

test("schema9 permission context preserves running-state compatibility", async () => {
  const repositoryRoot = await createGitRepository();
  const fixture = createProfileAwareFixture({ writableRoot: repositoryRoot });
  const sequence = fixture.projection.lastSequence + 1;
  fixture.entries.push({
    schemaVersion: 9,
    entryId: `entry:${fixture.profile.missionId}:${sequence}`,
    missionId: fixture.profile.missionId,
    sequence,
    type: "execution.transition",
    timestamp: { value: "2026-07-29T16:00:00Z", provenance: "hostTrusted" },
    payload: { from: "not-started", to: "running" },
  });
  const runningProjection = replay(fixture.entries);
  await writeJournal(repositoryRoot, fixture.profile.missionId, fixture.entries);

  const result = await loadSchema9PermissionContextV1(makePermissionInput({
    repositoryRoot,
    missionId: fixture.profile.missionId,
    expectedDecisionId: "decision:schema9:running-compatible",
    plan: permissionPlanFromProjection(runningProjection),
    hostOps: makeGitHostOps({
      repositoryRoot,
      topLevel: repositoryRoot,
      headFactory: () => FIXED_HEAD_REVISION,
      probeCapability: async () => true,
    }),
  }));

  assert.equal(result.state, "ready");
  assert.equal(result.context.evaluatedThroughSequence, sequence);
  assert.equal(result.context.activeBindings[0].lifecycleState, "active");
});

test("accessor-backed and throwing loader inputs fail closed before host operations", async () => {
  let getterCalls = 0;
  const missionId = "mission:schema9:hostile-input";
  const input = {
    configuredJournalPath: ".shield/journals",
    missionId,
    expectedDecisionId: "decision:schema9:hostile-input",
    plan: permissionPlan({
      missionId,
      subjectId: "issue:schema9-hostile-input",
      revisionId: "sha256:1111111111111111111111111111111111111111111",
      evaluatedThroughSequence: 0,
    }),
    hostId: "host:schema9",
    trustedHostOps: { probeCapability: async () => true },
  };
  Object.defineProperty(input, "repositoryRoot", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("must not execute");
    },
  });
  const accessor = await loadSchema9PermissionContextV1(input);
  assert.equal(accessor.state, "blocked");
  assert.equal(accessor.code, "input_invalid");
  assert.equal(getterCalls, 0);

  const throwing = await loadSchema9PermissionContextV1(new Proxy({}, {
    ownKeys() { throw new Error("inspection failed"); },
  }));
  assert.equal(throwing.state, "blocked");
  assert.equal(throwing.code, "input_invalid");

  const missionMismatch = await loadSchema9PermissionContextV1({
    repositoryRoot: "/workspace/repository",
    configuredJournalPath: ".shield/journals",
    missionId,
    expectedDecisionId: "decision:schema9:mission-mismatch",
    plan: permissionPlan({
      missionId: "mission:schema9:different",
      subjectId: "issue:schema9-hostile-input",
      revisionId: "sha256:1111111111111111111111111111111111111111111",
      evaluatedThroughSequence: 0,
    }),
    hostId: "host:schema9",
    trustedHostOps: { probeCapability: async () => true },
  });
  assert.equal(missionMismatch.state, "blocked");
  assert.equal(missionMismatch.code, "input_invalid");
});
