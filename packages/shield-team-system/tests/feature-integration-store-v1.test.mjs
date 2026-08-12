import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { lstat, mkdtemp, open, readFile, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  FEATURE_OPERATION_DERIVATION_KINDS,
  FEATURE_OPERATION_FIXED_EXCLUSIONS,
  FEATURE_OPERATION_PROHIBITED_EFFECTS,
  computeFeatureOperationAuthorityDigestV1,
  computeFeatureOperationPlanDigestV1,
} from "../dist/feature-operation-v1.mjs";
import {
  canonicalFeatureIntegrationJsonV1,
  createFeatureIntegrationEntryV1,
  createFeatureOperationGenesisEntryV1,
  createFeatureOperationJournalV1,
} from "../dist/feature-integration-v1.mjs";
import { computeEd25519SigningKeyRef } from "../dist/mission-v2.mjs";
import {
  appendFeatureOperationJournalStoreV1,
  initializeFeatureOperationJournalStoreV1,
  readFeatureOperationJournalStoreV1,
  recoverFeatureOperationJournalStoreV1,
  resolveFeatureIntegrationStorePathsV1,
} from "../dist/feature-integration-store-v1.mjs";

const digest = (character) => `sha256:${character.repeat(64)}`;
const revision = (character) => character.repeat(40);
const zero = digest("0");
const effect = (kind, character) => `effect:${kind}:${character.repeat(64)}`;
const privateKey = createPrivateKey({ key: Buffer.from(`302e020100300506032b657004220420${"42".repeat(32)}`, "hex"), format: "der", type: "pkcs8" });
const publicKeySpkiBase64 = createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64");
const signingKeyRef = computeEd25519SigningKeyRef(publicKeySpkiBase64);

function signAuthority(authority) {
  const bytes = Buffer.concat([
    Buffer.from("shield.feature-operation.authority.signature.v1\0", "ascii"),
    Buffer.from(canonicalFeatureIntegrationJsonV1(authority), "utf8"),
  ]);
  return { payload: structuredClone(authority), signatureBase64: sign(null, bytes, privateKey).toString("base64") };
}

function fixture() {
  const effects = FEATURE_OPERATION_DERIVATION_KINDS.map((kind, index) => effect(kind, String(index + 1)));
  let plan = {
    schemaVersion: 1, contractVersion: "feature.operation.v1", operationId: "operation:store", objective: "Store a feature operation",
    sourceProvenance: { authority: "none", sourceRef: "issue:226" }, repositoryId: "repo:shield", baseBranch: "main",
    baseRevision: revision("a"), baseTreeDigest: digest("a"), featureBranch: "feature/store",
    acceptanceCriteria: [{ criterionId: "criterion:one", statement: "Complete one child" }],
    children: [{
      childId: "mission:child-one", order: 0, objective: "Implement child", dependsOn: [], branchName: "agent/child-one", repositoryId: "repo:shield",
      riskClassification: "moderate", acceptanceCriterionIds: ["criterion:one"], permittedDerivations: FEATURE_OPERATION_DERIVATION_KINDS.filter((item) => item.startsWith("child_")),
      allowedRelativePaths: ["packages/child"], allowedActionIds: ["branch_create", "draft_pr_create", "integrate", "repository_edit", "revert"], allowedEffectKeys: effects,
      allowedCapabilityIds: ["child_branch_write", "child_pr_write", "feature_branch_write", "feature_workspace_pr_write", "repository_write"], allowedValidationIds: ["build", "test"],
      allowedPublicationOperations: ["draft_pr_create"], requiredGates: { mack: true, fury: true, humanGateIds: ["fitz"] }, exclusions: FEATURE_OPERATION_FIXED_EXCLUSIONS,
      maxImplementationAttempts: 1, maxPublicationAttempts: 1, maxIntegrationAttempts: 1, maxRollbackAttempts: 1, maxRetries: 0,
    }],
    eligibilityOrder: ["mission:child-one"], integrationPolicy: { targetBranch: "feature/store", allowedMethods: ["squash"] },
    lifecyclePolicy: { amendmentsRequireFreshAuthority: true, pauseSupported: true, cancellationSupported: true, rollbackMethod: "revert_commit", expiryEnforced: true, escalationOnAmbiguity: true },
    limits: { maxDurationSeconds: 3600, maxChildren: 1, maxConcurrency: 1, maxFeatureBranchCreateAttempts: 1, maxFeatureWorkspaceDraftPrAttempts: 1, maxTotalChildAttempts: 4, maxTotalIntegrationAttempts: 1, maxTotalRollbackAttempts: 1, maxCapturedEvidence: 10 },
    finalGates: { fitzRequired: true, simmons: "conditional", coulsonRequired: true }, exclusions: FEATURE_OPERATION_FIXED_EXCLUSIONS,
    expiresAt: "2029-05-01T01:00:00Z", planSequence: 0, predecessorPlanDigest: null, planDigest: zero,
  };
  plan.planDigest = computeFeatureOperationPlanDigestV1(plan);
  let authority = {
    schemaVersion: 1, contractVersion: "feature.operation.v1", authorityKind: "epic_wheels_up", authorityId: "authority:store", missionId: "mission:store", operationId: plan.operationId,
    plan, planDigest: plan.planDigest, repositoryId: plan.repositoryId, baseBranch: plan.baseBranch, baseRevision: plan.baseRevision, featureBranch: plan.featureBranch,
    operationSequence: 0, journalSequence: 0, issuedAt: "2029-05-01T00:00:00Z", expiresAt: plan.expiresAt, limits: plan.limits,
    permittedDerivations: FEATURE_OPERATION_DERIVATION_KINDS, prohibitedEffects: FEATURE_OPERATION_PROHIBITED_EFFECTS,
    humanPrincipalId: "human:coulson", humanBindingId: "binding:coulson", signingKeyRef, authorityDigest: zero,
  };
  authority.authorityDigest = computeFeatureOperationAuthorityDigestV1(authority);
  const replay = {
    schemaVersion: 1, contractVersion: "feature.operation.v1", repositoryId: plan.repositoryId, operationId: plan.operationId, activePlan: plan, activePlanDigest: plan.planDigest,
    verifiedAuthorityId: authority.authorityId, verifiedAuthorityDigest: authority.authorityDigest, acceptedAuthorityOperationSequence: 0, currentJournalSequence: 0,
    acceptedPlanLineage: [{ planSequence: 0, planDigest: plan.planDigest, predecessorPlanDigest: null, authorityDigest: authority.authorityDigest, active: true }], acceptedAmendmentDigests: [],
    lifecycle: { state: "active", atOperationSequence: 0 }, transitions: [{ kind: "genesis", operationSequence: 0, effectKey: "effect:genesis", priorHeadRevision: plan.baseRevision, priorTreeDigest: plan.baseTreeDigest, resultingHeadRevision: plan.baseRevision, resultingTreeDigest: plan.baseTreeDigest, receiptDigest: digest("b") }],
    acceptedIntegrations: [], acceptedRollbacks: [], consumedEffectKeys: ["effect:genesis"],
    childCounters: [{ childId: "mission:child-one", initiationAttempts: 0, implementationAttempts: 0, publicationAttempts: 0, integrationAttempts: 0, rollbackAttempts: 0, retryAttempts: 0 }], activeLeases: [],
    operationCounters: { featureBranchCreateAttempts: 0, featureWorkspaceDraftPrAttempts: 0, totalChildAttempts: 0, totalIntegrationAttempts: 0, totalRollbackAttempts: 0, capturedEvidenceCount: 0 },
    observedAt: { value: "2029-05-01T00:30:00Z", provenance: "hostTrusted" }, acceptedReviewEvidence: [],
  };
  const trustedBindings = [{ schemaVersion: 1, bindingId: authority.humanBindingId, humanPrincipalId: authority.humanPrincipalId, seatId: "coulson", missionScope: authority.missionId, signingKeyRef, publicKeySpkiBase64, validFromSequence: 0, validThroughSequence: null, attestedBy: "human:hill", provenanceRef: "registry:fixture" }];
  return createFeatureOperationJournalV1([createFeatureOperationGenesisEntryV1({ operationId: plan.operationId, replayContext: replay, signedAuthority: signAuthority(authority), trustedBindings })]);
}

test("store initializes, reads, idempotently initializes, and rejects a conflicting baseline", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "feature-integration-store-")); t.after(() => rm(root, { recursive: true, force: true }));
  const journal = fixture(); const scope = { repositoryRoot: root, operationId: journal.operationId, lockOwnerId: "may:test" };
  const initialized = await initializeFeatureOperationJournalStoreV1({ ...scope, journal });
  assert.equal(initialized.state, "accepted", JSON.stringify(initialized));
  assert.equal((await initializeFeatureOperationJournalStoreV1({ ...scope, journal })).state, "accepted");
  const read = await readFeatureOperationJournalStoreV1(scope); assert.equal(read.state, "accepted"); assert.equal(read.value.journal.journalDigest, journal.journalDigest);
  assert.equal(await readFile(read.value.journalPath, "utf8"), read.value.bytes);
});

test("store compare-and-appends once and classifies recovery", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "feature-integration-append-")); t.after(() => rm(root, { recursive: true, force: true }));
  const journal = fixture(); const scope = { repositoryRoot: root, operationId: journal.operationId, lockOwnerId: "may:test" };
  await initializeFeatureOperationJournalStoreV1({ ...scope, journal });
  const entry = createFeatureIntegrationEntryV1({ operationId: journal.operationId, entrySequence: 1, entryKind: "operation_paused", previousEntryDigest: journal.latestAcceptedEntryDigest, payload: {} });
  const appended = await appendFeatureOperationJournalStoreV1({ ...scope, expectedEntrySequence: 1, expectedLatestEntryDigest: journal.latestAcceptedEntryDigest, entry });
  assert.equal(appended.state, "accepted", JSON.stringify(appended));
  assert.equal((await appendFeatureOperationJournalStoreV1({ ...scope, expectedEntrySequence: 1, expectedLatestEntryDigest: journal.latestAcceptedEntryDigest, entry })).state, "accepted");
  const recovery = await recoverFeatureOperationJournalStoreV1({ ...scope, baselineJournalDigest: journal.journalDigest, candidateJournalDigest: appended.value.journal.journalDigest });
  assert.equal(recovery.state, "accepted"); assert.equal(recovery.value.classification, "complete_candidate");
});

test("store rejects malformed scope and invalid replay without touching disk", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "feature-integration-invalid-")); t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal((await resolveFeatureIntegrationStorePathsV1({ repositoryRoot: root, operationId: "../escape", lockOwnerId: "may:test" })).state, "blocked");
  const genesis = createFeatureIntegrationEntryV1({ operationId: "operation:invalid", entrySequence: 0, entryKind: "operation_genesis_accepted", previousEntryDigest: null, payload: {} });
  const result = await initializeFeatureOperationJournalStoreV1({ repositoryRoot: root, operationId: "operation:invalid", lockOwnerId: "may:test", journal: createFeatureOperationJournalV1([genesis]) });
  assert.equal(result.state, "blocked");
});

test("store rejects journal inode replacement with a symlink after the no-follow open", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "feature-integration-inode-")); t.after(() => rm(root, { recursive: true, force: true }));
  const journal = fixture(); const scope = { repositoryRoot: root, operationId: journal.operationId, lockOwnerId: "may:test" };
  const initialized = await initializeFeatureOperationJournalStoreV1({ ...scope, journal });
  assert.equal(initialized.state, "accepted", JSON.stringify(initialized));
  const retainedPath = `${initialized.value.journalPath}.retained`;
  let replaced = false;
  const result = await readFeatureOperationJournalStoreV1(scope, {
    async openFile(path, flags) {
      const handle = await open(path, flags);
      if (!replaced) {
        replaced = true;
        await rename(path, retainedPath);
        await symlink(retainedPath, path);
      }
      return handle;
    },
  });
  assert.equal(result.state, "blocked");
  assert.equal(result.code, "unsafe_file");
});

test("store retains lock ownership and fails closed when the lock changes after the journal write", async (t) => {
  for (const scenario of ["replacement", "deletion", "owner_drift", "unverifiable"]) {
    await t.test(scenario, async (t) => {
      const root = await mkdtemp(join(tmpdir(), `feature-integration-lock-${scenario}-`)); t.after(() => rm(root, { recursive: true, force: true }));
      const journal = fixture(); const scope = { repositoryRoot: root, operationId: journal.operationId, lockOwnerId: "may:test" };
      const paths = await resolveFeatureIntegrationStorePathsV1(scope); assert.equal(paths.state, "accepted");
      const retainedPath = `${paths.value.lockPath}.retained`;
      let checks = 0;
      const result = await initializeFeatureOperationJournalStoreV1({ ...scope, journal }, {
        async lstatLock(path) {
          checks += 1;
          if (checks === 3) {
            if (scenario === "replacement") {
              await rename(path, retainedPath);
              await writeFile(path, "may:other\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
            } else if (scenario === "deletion") {
              await unlink(path);
            } else if (scenario === "owner_drift") {
              await writeFile(path, "may:other\n", "utf8");
            } else {
              const error = new Error("lock state unavailable"); error.code = "EIO"; throw error;
            }
          }
          return lstat(path);
        },
      });
      assert.equal(result.state, "recovery_required", JSON.stringify(result));
      assert.equal(result.code, "durability_uncertain");
      assert.equal(result.expectedJournalDigest, journal.journalDigest);
      if (scenario === "replacement" || scenario === "owner_drift") assert.equal(await readFile(paths.value.lockPath, "utf8"), "may:other\n");
    });
  }
});

test("store reports release failure while retaining its verified lock", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "feature-integration-lock-release-")); t.after(() => rm(root, { recursive: true, force: true }));
  const journal = fixture(); const scope = { repositoryRoot: root, operationId: journal.operationId, lockOwnerId: "may:test" };
  const paths = await resolveFeatureIntegrationStorePathsV1(scope); assert.equal(paths.state, "accepted");
  const result = await initializeFeatureOperationJournalStoreV1({ ...scope, journal }, {
    async unlinkLock() { const error = new Error("release denied"); error.code = "EACCES"; throw error; },
  });
  assert.equal(result.state, "recovery_required", JSON.stringify(result));
  assert.equal(result.code, "durability_uncertain");
  assert.equal(result.expectedJournalDigest, journal.journalDigest);
  assert.equal(await readFile(paths.value.lockPath, "utf8"), "may:test\n");
});
