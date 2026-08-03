import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import test from "node:test";
import { canonicalJson, computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import {
  IMPLEMENTATION_AUTHORITY_SCHEMA_VERSION,
  IMPLEMENTATION_AUTHORITY_CONTRACT_VERSION,
  computeImplementationAuthorityDigest,
  computeSchema9RuntimeBindingDigest,
  computeRuntimeBindingDigest,
  validateImplementationAuthorityV1,
  verifySignedImplementationAuthorityV1,
  verifySignedImplementationAuthorityRevocationV1,
  validateSchema9RuntimeBindingV1,
  validateSchema9RuntimeBindingAuthorizationPayload,
  verifySignedSchema9RuntimeBindingAuthorizationV1,
  assertAuthoritySubsetOfScope,
} from "../dist/implementation-authority-v1.mjs";

function authoritySigner() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
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
      attestedBy: "review-board",
      provenanceRef: "repository-config:coulson",
    },
  };
}

function authority(overrides = {}) {
  return {
    schemaVersion: IMPLEMENTATION_AUTHORITY_SCHEMA_VERSION,
    contractVersion: IMPLEMENTATION_AUTHORITY_CONTRACT_VERSION,
    authorityKind: "wheels_up",
    authorityRef: "authority:issue-181",
    missionId: "mission:issue-181",
    subjectId: "issue:181",
    seatId: "may",
    missionRevisionId: "sha256:mission_revision",
    artifactRevisionId: "sha256:artifact_revision",
    repositoryId: "repo:shield",
    canonicalWritableRoot: "/workspace/shield",
    branch: "main",
    baseRevision: "sha256:base_revision",
    headRevision: "sha256:head_revision",
    modelId: "model:claude",
    approvedRelativePaths: ["docs/issue-181", "src"],
    approvedActionIds: ["edit:implementation", "read:issue"],
    approvedEffectClasses: ["behavioral_implementation", "verification"],
    approvedEffectKeys: ["effect:edit", "effect:verify"],
    approvedCapabilities: ["filesystem_write", "github_issues"],
    validationCommandIds: ["validation:lint", "validation:test"],
    journalSequence: 1,
    humanPrincipalId: "human:coulson",
    humanBindingId: "binding:coulson",
    signingKeyRef: "ed25519:sha256:XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    sourceRef: "source:authority:1",
    evidenceRef: "evidence:authority:1",
    timestamp: { value: "2026-08-03T20:00:00Z", provenance: "humanRecorded" },
    ...overrides,
  };
}

function signPayload(payload, privateKey) {
  return { payload, signatureBase64: sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString("base64") };
}

function runtimeBinding(overrides = {}) {
  return {
    bindingSchemaVersion: 1,
    bindingId: "binding:may:runtime",
    bindingVersion: 1,
    missionId: "mission:issue-181",
    subjectId: "issue:181",
    missionRevisionId: "sha256:mission_revision",
    seatId: "may",
    reasoningRuntimeId: "runtime:may",
    toolExecutorId: "executor:codex",
    repositoryId: "repo:shield",
    canonicalWritableRoot: "/workspace/shield",
    branch: "main",
    artifactRevisionId: "sha256:artifact_revision",
    recordedAtSequence: 3,
    activeThroughSequence: null,
    lifecycleState: "active",
    approvedScope: {
      actionIds: ["edit:implementation", "read:issue"],
      effectClasses: ["behavioral_implementation", "verification"],
      effectKeys: ["effect:edit", "effect:verify"],
      capabilities: ["filesystem_write", "github_issues"],
    },
    coulsonAuthorizationRef: "authorization:runtime-binding:recorded",
    ...overrides,
  };
}

function schema9Wrapper(authorityPayload, overrides = {}) {
  return {
    schemaVersion: 1,
    binding: runtimeBinding(),
    implementationAuthorityRef: authorityPayload.authorityRef,
    implementationAuthorityDigest: computeImplementationAuthorityDigest(authorityPayload),
    implementationAuthoritySequence: authorityPayload.journalSequence,
    approvedRelativePaths: ["docs/issue-181", "src"],
    validationCommandIds: ["validation:lint", "validation:test"],
    modelId: authorityPayload.modelId,
    baseRevision: authorityPayload.baseRevision,
    headRevision: authorityPayload.headRevision,
    ...overrides,
  };
}

function schema9AuthorizationInput(authorityPayload, wrapper, binding, signingKey, overrides = {}) {
  return {
    schemaVersion: 1,
    authorizationId: "authorization:runtime-binding:recorded",
    missionId: authorityPayload.missionId,
    subjectId: authorityPayload.subjectId,
    seatId: binding.seatId,
    bindingId: binding.bindingId,
    bindingVersion: binding.bindingVersion,
    priorBindingId: null,
    priorBindingVersion: null,
    bindingDigest: computeRuntimeBindingDigest(binding),
    schema9BindingDigest: computeSchema9RuntimeBindingDigest(wrapper),
    artifactRevisionId: binding.artifactRevisionId,
    decision: "approved",
    previousJournalSequence: 2,
    journalSequence: 3,
    humanPrincipalId: "human:coulson",
    humanBindingId: "binding:coulson",
    signingKeyRef: computeEd25519SigningKeyRef(signingKey),
    sourceRef: "source:runtime-binding:1",
    timestamp: { value: "2026-08-03T20:03:00Z", provenance: "humanRecorded" },
    ...overrides,
  };
}

test("implementation authority strict validation and signed verification", () => {
  const { privateKey: coulsonPrivate, binding: coulsonBinding } = authoritySigner();
  const validAuthority = authority({ signingKeyRef: coulsonBinding.signingKeyRef });
  const signedAuthority = signPayload(validAuthority, coulsonPrivate);
  const envelope = { payload: validAuthority, signatureBase64: signedAuthority.signatureBase64 };
  const result = verifySignedImplementationAuthorityV1(
    envelope,
    [coulsonBinding],
    validAuthority.missionId,
    validAuthority.subjectId,
    validAuthority.missionRevisionId,
    validAuthority.journalSequence,
  );
  assert.equal(result.state, "valid", result.errors?.join(" "));
  assert.equal(result.value.authorityRef, validAuthority.authorityRef);
  const copyProbe = verifySignedImplementationAuthorityV1(
    { ...envelope },
    [coulsonBinding],
    validAuthority.missionId,
    validAuthority.subjectId,
    validAuthority.missionRevisionId,
    validAuthority.journalSequence,
  );
  assert.equal(copyProbe.state, "valid", copyProbe.errors?.join(" "));
  copyProbe.value.approvedRelativePaths.push("tamper");
  assert.equal(result.value.approvedRelativePaths.includes("tamper"), false);
});

test("implementation authority validator rejects malformed and mismatched fields", () => {
  const trusted = authoritySigner();
  const valid = authority({ signingKeyRef: trusted.binding.signingKeyRef });
  const envelope = signPayload(valid, trusted.privateKey);
  assert.equal(validateImplementationAuthorityV1({ ...valid, approvedRelativePaths: [...valid.approvedRelativePaths, "../forbidden"] }).state, "invalid");
  assert.equal(validateImplementationAuthorityV1({ ...valid, approvedRelativePaths: valid.approvedRelativePaths.sort((left, right) => right.localeCompare(left)) }).state, "invalid");
  assert.equal(verifySignedImplementationAuthorityV1(
    envelope,
    [trusted.binding],
    "mission:wrong",
    valid.subjectId,
    valid.missionRevisionId,
    valid.journalSequence,
  ).state, "invalid");
  assert.equal(verifySignedImplementationAuthorityV1(
    envelope,
    [trusted.binding],
    valid.missionId,
    valid.subjectId,
    valid.missionRevisionId,
    valid.journalSequence + 1,
  ).state, "invalid");
  const mismatched = { ...envelope, payload: { ...valid, signingKeyRef: "ed25519:sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" } };
  assert.equal(verifySignedImplementationAuthorityV1(
    signPayload(mismatched.payload, trusted.privateKey),
    [trusted.binding],
    valid.missionId,
    valid.subjectId,
    valid.missionRevisionId,
    valid.journalSequence,
  ).state, "invalid");
});

test("implementation authority revocation is strictly bound to active authority and sequence", () => {
  const { privateKey: coulsonPrivate, binding: coulsonBinding } = authoritySigner();
  const validAuthority = authority({ signingKeyRef: coulsonBinding.signingKeyRef });
  const authorityDigest = computeImplementationAuthorityDigest(validAuthority);
  const revocation = {
    schemaVersion: 1,
    contractVersion: "implementation-authority.v1",
    authorityRef: validAuthority.authorityRef,
    authorityDigest,
    authoritySequence: validAuthority.journalSequence,
    missionId: validAuthority.missionId,
    subjectId: validAuthority.subjectId,
    missionRevisionId: validAuthority.missionRevisionId,
    previousJournalSequence: 1,
    journalSequence: 2,
    humanPrincipalId: "human:coulson",
    humanBindingId: "binding:coulson",
    signingKeyRef: coulsonBinding.signingKeyRef,
    sourceRef: "source:authority-revocation:1",
    timestamp: { value: "2026-08-03T20:06:00Z", provenance: "humanRecorded" },
  };
  const signedRevocation = signPayload(revocation, coulsonPrivate);
  assert.equal(
    verifySignedImplementationAuthorityRevocationV1(
      signedRevocation,
      [coulsonBinding],
      {
        missionId: validAuthority.missionId,
        subjectId: validAuthority.subjectId,
        missionRevisionId: validAuthority.missionRevisionId,
        authorityRef: validAuthority.authorityRef,
        authorityDigest,
        authoritySequence: validAuthority.journalSequence,
      },
      2,
    ).state,
    "valid",
  );
  const wrongAuthority = { ...revocation, authorityRef: "authority:other", journalSequence: 2 };
  assert.equal(verifySignedImplementationAuthorityRevocationV1(
    signPayload(wrongAuthority, coulsonPrivate),
    [coulsonBinding],
    {
      missionId: validAuthority.missionId,
      subjectId: validAuthority.subjectId,
      missionRevisionId: validAuthority.missionRevisionId,
      authorityRef: validAuthority.authorityRef,
      authorityDigest,
      authoritySequence: validAuthority.journalSequence,
    },
    2,
  ).state, "invalid");
});

test("schema9 runtime-binding wrapper validation, auth validation, and signature verification", () => {
  const { privateKey: coulsonPrivate, binding: coulsonBinding } = authoritySigner();
  const authorityPayload = authority({ signingKeyRef: coulsonBinding.signingKeyRef });
  const binding = runtimeBinding();
  const wrapper = schema9Wrapper(authorityPayload, { binding });
  assert.equal(validateSchema9RuntimeBindingV1(wrapper).state, "valid");
  const validAuthPayload = schema9AuthorizationInput(authorityPayload, wrapper, binding, coulsonBinding.publicKeySpkiBase64, { previousJournalSequence: 2, journalSequence: 3 });
  assert.equal(validateSchema9RuntimeBindingAuthorizationPayload(validAuthPayload).state, "valid");
  const signedAuth = signPayload(validAuthPayload, coulsonPrivate);
  assert.equal(
    verifySignedSchema9RuntimeBindingAuthorizationV1(
      signedAuth,
      wrapper,
      {
        missionId: authorityPayload.missionId,
        subjectId: authorityPayload.subjectId,
        missionRevisionId: authorityPayload.missionRevisionId,
        trustedBindings: [coulsonBinding],
        implementationAuthority: authorityPayload,
        lastSequence: 2,
      },
      null,
      null,
    ).state,
    "valid",
  );
  assert.equal(assertAuthoritySubsetOfScope(wrapper, authorityPayload).state, "valid");
  const wide = schema9Wrapper(authorityPayload, {
    approvedRelativePaths: ["docs/issue-181", "infra", "src"],
  });
  assert.equal(assertAuthoritySubsetOfScope(wide, authorityPayload).state, "invalid");
});
