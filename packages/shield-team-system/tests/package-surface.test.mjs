import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = resolve(packageRoot, "../..");
const npmCache = join(tmpdir(), "shield-v0.3-2-npm-cache");

test("exports only the documented public package specifiers", async () => {
  const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.exports), [
    ".",
    "./mission",
    "./intake",
    "./dispatch-receipts",
    "./journal",
    "./modes",
    "./workspace",
    "./hill-readiness",
    "./config",
    "./supervision",
    "./delegation",
    "./adapter",
    "./runner",
    "./permission",
    "./schema9-permission-context",
    "./governed-may-dispatch",
    "./roles",
    "./permission-audit",
    "./review-publication",
    "./pipeline",
    "./mission-profile",
    "./profile-aware-mission",
    "./implementation-authority",
    "./feature-operation",
    "./feature-integration",
    "./daisy-coordination-authority",
    "./mission-runtime",
    "./mission-builder",
    "./sonarqube",
    "./mack-validation",
    "./qa-mode",
    "./knowledge",
    "./local-tools",
    "./github",
  ]);
  for (const target of Object.values(manifest.exports)) {
    assert.deepEqual(Object.keys(target), ["types", "import"]);
  }
});

test("loads every supported runtime specifier", async () => {
  const root = await import("@shield/team-system");
  const mission = await import("@shield/team-system/mission");
  const intake = await import("@shield/team-system/intake");
  const dispatchReceipts = await import("@shield/team-system/dispatch-receipts");
  const journal = await import("@shield/team-system/journal");
  const modes = await import("@shield/team-system/modes");
  const workspace = await import("@shield/team-system/workspace");
  const hillReadiness = await import("@shield/team-system/hill-readiness");
  const config = await import("@shield/team-system/config");
  const supervision = await import("@shield/team-system/supervision");
  const delegation = await import("@shield/team-system/delegation");
  const adapter = await import("@shield/team-system/adapter");
  const runner = await import("@shield/team-system/runner");
  const permission = await import("@shield/team-system/permission");
  const schema9PermissionContext = await import("@shield/team-system/schema9-permission-context");
  const governedMayDispatch = await import("@shield/team-system/governed-may-dispatch");
  const roles = await import("@shield/team-system/roles");
  const permissionAudit = await import("@shield/team-system/permission-audit");
  const reviewPublication = await import("@shield/team-system/review-publication");
  const pipeline = await import("@shield/team-system/pipeline");
  const missionProfile = await import("@shield/team-system/mission-profile");
  const profileAwareMission = await import("@shield/team-system/profile-aware-mission");
  const missionRuntime = await import("@shield/team-system/mission-runtime");
  const missionBuilder = await import("@shield/team-system/mission-builder");
  const implementationAuthority = await import("@shield/team-system/implementation-authority");
  const featureOperation = await import("@shield/team-system/feature-operation");
  const featureIntegration = await import("@shield/team-system/feature-integration");
  const daisyCoordinationAuthority = await import("@shield/team-system/daisy-coordination-authority");
  const sonarqube = await import("@shield/team-system/sonarqube");
  const mackValidation = await import("@shield/team-system/mack-validation");
  const qaMode = await import("@shield/team-system/qa-mode");
  const knowledge = await import("@shield/team-system/knowledge");
  const localTools = await import("@shield/team-system/local-tools");
  const github = await import("@shield/team-system/github");

  assert.equal(root.MISSION_SCHEMA_VERSION, 2);
  assert.equal(mission.classifyMissionRisk, root.classifyMissionRisk);
  assert.equal(intake.MISSION_INTAKE_CONTRACT_VERSION, "mission.intake.v1");
  assert.equal(typeof intake.missionIntakeV1, "function");
  assert.equal(typeof intake.profileAwareMissionIntakeV1, "function");
  assert.equal(typeof dispatchReceipts.appendSeatDispatchReceiptEntryV1, "function");
  assert.equal(typeof dispatchReceipts.claimSeatDispatchPacketV1, "function");
  assert.equal(typeof dispatchReceipts.readSeatDispatchReceiptByReceiptIdV1, "function");
  assert.equal(typeof dispatchReceipts.readSeatDispatchReceiptsByChildTaskSessionV1, "function");
  assert.equal(typeof dispatchReceipts.replaySeatDispatchReceiptsV1, "function");
  assert.equal(typeof mission.evaluateSpecialistIteration, "function");
  assert.equal(journal.JOURNAL_SCHEMA_VERSION, 1);
  assert.equal(modes.MODE_MANIFEST_SCHEMA_VERSION, 1);
  assert.equal(typeof workspace.validateMissionWorkspaceInput, "function");
  assert.equal(missionProfile.MISSION_PROFILE_CONTRACT_VERSION, "mission.profile.v1");
  assert.equal(typeof missionProfile.freezeMissionRequirementsV1, "function");
  assert.equal(profileAwareMission.PROFILE_AWARE_JOURNAL_SCHEMA_VERSION, 9);
  assert.equal(typeof profileAwareMission.replayProfileAwareMissionJournal, "function");
  assert.equal(implementationAuthority.IMPLEMENTATION_AUTHORITY_SCHEMA_VERSION, 1);
  assert.equal(implementationAuthority.IMPLEMENTATION_AUTHORITY_CONTRACT_VERSION, "implementation-authority.v1");
  assert.equal(typeof implementationAuthority.validateImplementationAuthorityV1, "function");
  assert.equal(implementationAuthority.IMPLEMENTATION_AUTHORITY_KIND, "wheels_up");
  assert.equal(featureOperation.FEATURE_OPERATION_SCHEMA_VERSION, 1);
  assert.equal(featureOperation.FEATURE_OPERATION_CONTRACT_VERSION, "feature.operation.v1");
  assert.equal(featureOperation.FEATURE_OPERATION_SCHEMA_VERSION_V2, 2);
  assert.equal(featureOperation.FEATURE_OPERATION_CONTRACT_VERSION_V2, "feature.operation.v2");
  assert.equal(featureOperation.FEATURE_OPERATION_AUTHORITY_KIND, "epic_wheels_up");
  assert.equal(typeof featureOperation.evaluateFeatureOperationDerivedCandidateV1, "function");
  assert.equal(typeof featureOperation.verifySignedFeatureOperationAuthorityV1, "function");
  assert.equal(typeof featureOperation.evaluateFeatureOperationDerivedCandidateV2, "function");
  assert.equal(typeof featureOperation.verifySignedFeatureOperationAuthorityV2, "function");
  assert.equal(featureIntegration.FEATURE_INTEGRATION_CONTRACT_VERSION, "feature.integration.v1");
  assert.equal(featureIntegration.FEATURE_INTEGRATION_CONTROLLER_CONTRACT_VERSION, "feature.integration.controller.v1");
  assert.equal(typeof featureIntegration.replayFeatureOperationJournalV1, "function");
  assert.equal(featureIntegration.FEATURE_INTEGRATION_CONTRACT_VERSION_V2, "feature.integration.v2");
  assert.equal(typeof featureIntegration.replayFeatureOperationJournalV2, "function");
  assert.equal(typeof featureIntegration.secureReplayFeatureOperationJournalV2, "function");
  assert.equal(typeof featureIntegration.readFeatureOperationJournalStoreV1, "function");
  assert.equal(typeof featureIntegration.acceptGovernedChildCompletionV1, "function");
  assert.equal(typeof featureIntegration.runFeatureIntegrationControllerV1, "function");
  assert.equal(daisyCoordinationAuthority.DAISY_COORDINATION_AUTHORITY_KIND, "daisy_feature_flight_coordination");
  assert.equal(typeof daisyCoordinationAuthority.validateDaisyCoordinationAuthorityV1, "function");
  assert.equal(daisyCoordinationAuthority.verifySignedImplementationAuthorityV1, undefined);
  assert.equal(typeof missionRuntime.runMissionCycle, "function");
  assert.equal(missionBuilder.MISSION_BUILDER_CONTRACT_VERSION, "mission.builder.v1");
  assert.equal(typeof missionBuilder.buildMissionDefinitionV1, "function");
  assert.equal(root.buildMissionDefinitionV1, missionBuilder.buildMissionDefinitionV1);
  assert.equal(hillReadiness.HILL_READINESS_RUBRIC_VERSION, "hill.readiness.v1");
  assert.equal(typeof hillReadiness.evaluateHillReadinessV1, "function");
  assert.equal(config.LEGACY_CONFIG_SCHEMA_VERSION, 1);
  assert.equal(config.CONFIG_SCHEMA_V2_VERSION, 2);
  assert.equal(config.CONFIG_SCHEMA_VERSION, 3);
  assert.deepEqual(config.SUPPORTED_CONFIG_SCHEMA_VERSIONS, [1, 2, 3]);
  assert.deepEqual(config.SUPPORTED_ADAPTER_IDS, ["github"]);
  assert.deepEqual(config.CONFIGURED_HOST_ADAPTER_IDS, ["github", "atlassian"]);
  assert.equal(Object.isFrozen(config.SUPPORTED_CONFIG_SCHEMA_VERSIONS), true);
  assert.equal(Object.isFrozen(config.REPOSITORY_TRUST_PROFILE_IDS), true);
  assert.equal(config.REPOSITORY_TRUST_PROFILE_CONTRACT_VERSION, "repository.trust-profile.v1");
  assert.equal(Object.isFrozen(config.REPOSITORY_TRUST_PROFILES_V1), true);
  assert.equal(root.validateShieldConfig, config.validateShieldConfig);
  assert.equal(supervision.SUPERVISED_JOURNAL_SCHEMA_VERSION, 2);
  assert.equal(supervision.RUNNER_JOURNAL_SCHEMA_VERSION, 5);
  assert.equal(supervision.REVIEW_JOURNAL_SCHEMA_VERSION, 7);
  assert.equal(typeof supervision.createSupervisedMissionBrief, "function");
  assert.equal(typeof supervision.deriveRepositoryMissionBindings, "function");
  assert.equal(typeof supervision.selectCoulsonOperationBinding, "function");
  assert.equal(typeof supervision.createExecutionEffectEntry, "function");
  assert.equal(typeof supervision.createReviewSubjectSupersessionEntry, "function");
  assert.equal(typeof supervision.createFuryReviewEntry, "function");
  assert.equal(delegation.WHEELS_OFF_POLICY_ID, "wheels_off.v1");
  assert.equal(adapter.ADAPTER_CONTRACT_VERSION, 1);
  assert.equal(typeof adapter.validateAdapterCandidate, "function");
  assert.equal(runner.RUNNER_CONTRACT_VERSION, 1);
  assert.equal(typeof runner.runRunnerCycle, "function");
  assert.equal(permission.PERMISSION_CONTRACT_VERSION, 1);
  assert.equal(typeof permission.evaluatePermission, "function");
  assert.equal(typeof schema9PermissionContext.loadSchema9PermissionContextV1, "function");
  assert.equal(typeof governedMayDispatch.runGovernedMayDispatchStepV1, "function");
  assert.equal(roles.ROLE_TAXONOMY_SCHEMA_VERSION, 1);
  assert.equal(roles.ROLE_TAXONOMY_CONTRACT_VERSION, "roles.v1");
  assert.deepEqual(roles.CANONICAL_ROLE_IDS, [
    "hill",
    "daisy",
    "fury",
    "may",
    "mack",
    "oracle",
    "coulson",
    "fitz",
    "simmons",
  ]);
  assert.equal(permissionAudit.PERMISSION_AUDIT_SCHEMA_VERSION, 1);
  assert.equal(typeof permissionAudit.replayPermissionAuditLedger, "function");
  assert.equal(reviewPublication.REVIEW_PUBLICATION_CONTRACT_VERSION, "review-publication.v1");
  assert.equal(typeof reviewPublication.evaluateReviewPublicationV1, "function");
  assert.equal(pipeline.PIPELINE_PROFILE_CONTRACT_VERSION, "pipeline.profile.v1");
  assert.equal(typeof pipeline.selectPipelineModesV1, "function");
  assert.equal(sonarqube.SONARQUBE_EVIDENCE_CONTRACT_VERSION, "sonarqube.evidence.v1");
  assert.equal(typeof sonarqube.evaluateSonarQubeEvidenceV1, "function");
  assert.equal(mackValidation.MACK_VALIDATION_CONTRACT_VERSION, "mack.validation.v0");
  assert.equal(typeof mackValidation.evaluateMackValidationV0, "function");
  assert.equal(qaMode.QA_MODE_CONTRACT_VERSION, "qa.mode.v0");
  assert.equal(typeof qaMode.createQaHandoffV0, "function");
  assert.equal(typeof qaMode.evaluateQaValidationV0, "function");
  assert.equal(knowledge.KNOWLEDGE_ENTRY_CONTRACT_VERSION, "knowledge.entry.v0");
  assert.equal(typeof knowledge.verifyKnowledgeSliceV0, "function");
  assert.equal(typeof localTools.runLocalToolSession, "function");
  assert.equal(localTools.DAISY_TOOL_DEFINITIONS.length, 3);
  assert.equal(typeof localTools.runMayToolCall, "function");
  assert.equal(typeof localTools.runMayControlLoop, "function");
  assert.equal(localTools.MAY_TOOL_DEFINITIONS.length, 2);
  assert.equal(typeof github.deliverGitHubCommunication, "function");
  assert.equal(typeof github.prepareDeliveryWorkspaceForDispatch, "function");
  assert.equal(github.FURY_PLAN_GATE_CONTRACT_VERSION, "fury.plan-gate.v1");
  assert.equal(typeof github.evaluateFuryPlanGateV1, "function");
  assert.equal(github.FURY_PLAN_REVIEW_EVIDENCE_CONTRACT_VERSION, "fury.plan-review-evidence.v1");
  assert.equal(typeof github.evaluateFuryPlanReviewEvidenceV1, "function");
  assert.equal(typeof github.replayFuryPlanReviewEvidenceLedgerV1, "function");
  assert.equal(github.deriveFuryPlanReviewEvidenceV1, undefined);
  assert.equal(typeof github.validatePRWorkspaceReceipt, "function");
  assert.equal(typeof github.renderMissionHandoff, "function");
});

test("dispatch-receipts export has one-way source graph", async () => {
  const facade = await readFile(join(packageRoot, "dist/dispatch-receipts.mjs"), "utf8");
  const store = await readFile(join(packageRoot, "dist/seat-dispatch-store.mjs"), "utf8");
  const receipt = await readFile(join(packageRoot, "dist/seat-dispatch-receipt-v1.mjs"), "utf8");
  assert.ok(facade.includes("./seat-dispatch-store.mjs"));
  assert.ok(facade.includes("./seat-dispatch-receipt-v1.mjs"));
  assert.ok(!store.includes("./dispatch-receipts.mjs"));
  assert.ok(!receipt.includes("dispatch-receipts"));
});

test("blocks undocumented deep package imports", async () => {
  await assert.rejects(
    import("@shield/team-system/contracts/mission-policy.mjs"),
    (error) => error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
  );
});

test("packs declarations and type-checks an external strict TypeScript consumer", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "shield-package-consumer-"));
  execFileSync("git", ["init", "--quiet"], { cwd: fixture });
  await writeFile(join(fixture, "package.json"), "{\"private\":true,\"type\":\"module\"}\n");
  const packOutput = JSON.parse(execFileSync(
    "npm",
    ["pack", packageRoot, "--json", "--ignore-scripts", "--pack-destination", fixture, "--cache", npmCache],
    { encoding: "utf8" },
  ));
  const packed = packOutput[0];
  const packedPaths = new Set(packed.files.map(({ path }) => path));
  for (const path of [
    "public/index.mjs",
    "public/index.d.mts",
    "public/mission.d.mts",
    "public/journal.d.mts",
    "public/modes.d.mts",
    "public/workspace.d.mts",
    "public/hill-readiness.mjs",
    "public/hill-readiness.d.mts",
    "dist/config.mjs",
    "dist/config.d.mts",
    "dist/mission-intake-v1.mjs",
    "dist/mission-intake-v1.d.mts",
    "dist/mission-v2.mjs",
    "dist/mission-v2.d.mts",
    "dist/delegation-v1.mjs",
    "dist/delegation-v1.d.mts",
    "dist/adapter-v1.mjs",
    "dist/adapter-v1.d.mts",
    "dist/implementation-authority-v1.mjs",
    "dist/daisy-coordination-authority-v1.mjs",
    "dist/daisy-coordination-authority-v1.d.mts",
    "public/daisy-coordination-authority.mjs",
    "public/daisy-coordination-authority.d.mts",
    "dist/implementation-authority-v1.d.mts",
    "dist/feature-operation-v1.mjs",
    "dist/feature-operation-v1.d.mts",
    "public/feature-operation.mjs",
    "public/feature-operation.d.mts",
    "dist/feature-integration-v1.mjs",
    "dist/feature-integration-v1.d.mts",
    "dist/feature-integration-store-v1.mjs",
    "dist/feature-integration-store-v1.d.mts",
    "dist/feature-integration-evidence-v1.mjs",
    "dist/feature-integration-evidence-v1.d.mts",
    "dist/feature-integration-validation-v1.mjs",
    "dist/feature-integration-validation-v1.d.mts",
    "public/feature-integration.mjs",
    "public/feature-integration.d.mts",
    "dist/runner-v1.mjs",
    "dist/runner-v1.d.mts",
    "dist/permission-v1.mjs",
    "dist/permission-v1.d.mts",
    "dist/schema9-permission-context-v1.mjs",
    "dist/schema9-permission-context-v1.d.mts",
    "dist/governed-may-dispatch-v1.mjs",
    "dist/governed-may-dispatch-v1.d.mts",
    "dist/role-taxonomy-v1.mjs",
    "dist/role-taxonomy-v1.d.mts",
    "dist/permission-audit-v1.mjs",
    "dist/permission-audit-v1.d.mts",
    "dist/mission-runtime-v1.mjs",
    "dist/mission-runtime-v1.d.mts",
    "dist/mission-builder-v1.mjs",
    "dist/mission-builder-v1.d.mts",
    "dist/dispatch-receipts.mjs",
    "dist/dispatch-receipts.d.mts",
    "dist/seat-dispatch-store.mjs",
    "dist/seat-dispatch-store.d.mts",
    "dist/seat-dispatch-receipt-v1.mjs",
    "dist/seat-dispatch-receipt-v1.d.mts",
    "dist/review-publication-v1.mjs",
    "dist/review-publication-v1.d.mts",
    "dist/pipeline-profile-v1.mjs",
    "dist/pipeline-profile-v1.d.mts",
    "dist/sonarqube-evidence-v1.mjs",
    "dist/sonarqube-evidence-v1.d.mts",
    "public/qa-mode.mjs",
    "public/qa-mode.d.mts",
    "public/knowledge.mjs",
    "public/knowledge.d.mts",
    "public/local-tools.mjs",
    "public/local-tools.d.mts",
    "scripts/model/may-tool-executor.mjs",
    "github/adapter-v1.mjs",
    "github/feature-integration-workspace-v1.mjs",
    "github/delivery-workspace.mjs",
    "github/pr-workspace.mjs",
    "public/github.mjs",
    "public/github.d.mts",
    "dist/cli.mjs",
    "docs/operations/mission-evidence-tools.md",
    "docs/operations/feature-flight-controller.md",
    "docs/operations/feature-flight-step.md",
    "docs/operations/feature-flight-recovery.md",
    "docs/operations/feature-flight-review-gates.md",
    "docs/operations/feature-operation-plan.md",
    "docs/operations/feature-integration.md",
    "docs/operations/persisted-artifact-contract-matrix.md",
    "scripts/operations/flight-contracts.mjs",
    "scripts/operations/feature-flight-controller.mjs",
    "scripts/operations/feature-flight-step-store.mjs",
    "scripts/operations/feature-flight-recovery.mjs",
    "scripts/operations/feature-flight-step.mjs",
    "scripts/operations/feature-flight-review-gates.mjs",
    "scripts/operations/feature-integration-controller-v1.mjs",
    "INSTALLATION.md",
    "PUBLIC_API.md",
    "SUPERVISED_MISSION.md",
    "WHEELS_OFF.md",
    "PERMISSION_BOUNDARY.md",
    "MISSION_BUILDER.md",
  ]) {
    assert.ok(packedPaths.has(path), `packed artifact is missing ${path}`);
  }
  const packedMackRunner = await readFile(join(packageRoot, "scripts/model/mack-validation-runner.mjs"), "utf8");
  assert.match(packedMackRunner, /export async function readMackProductionValidationRegistryV1/u);
  assert.doesNotMatch(packedMackRunner, /export (?:async )?function promoteProductionEvidence/u);
  for (const document of ["feature-flight-review-gates.md", "feature-operation-plan.md", "feature-integration.md", "persisted-artifact-contract-matrix.md"]) {
    assert.equal(
      await readFile(join(packageRoot, "docs/operations", document), "utf8"),
      await readFile(join(workspaceRoot, "docs/operations", document), "utf8"),
      `${document} package mirror drifted`,
    );
  }

  const tarball = join(fixture, packed.filename);
  execFileSync(
    "npm",
    ["install", "--save-dev", "--save-exact", tarball, "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", "--cache", npmCache],
    { cwd: fixture, stdio: "pipe" },
  );
  await writeFile(join(fixture, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      module: "NodeNext",
      moduleResolution: "NodeNext",
      target: "ES2022",
    },
    include: ["consumer.mts"],
  }));
  await writeFile(join(fixture, "consumer.mts"), `
    import { MISSION_SCHEMA_VERSION, type MissionDecisionEvent, type MissionState } from "@shield/team-system";
    import { classifyMissionRisk, evaluateSpecialistIteration, type RiskFlags, type SpecialistIterationEvidenceV1 } from "@shield/team-system/mission";
    import { MISSION_INTAKE_CONTRACT_VERSION, missionIntakeV1, type MissionIntakeRequestV1, type MissionIntakeResultV1 } from "@shield/team-system/intake";
    import { JOURNAL_SCHEMA_VERSION, type JournalEntry } from "@shield/team-system/journal";
    import { MODE_MANIFEST_SCHEMA_VERSION, type ModeManifest } from "@shield/team-system/modes";
    import { validateMissionWorkspaceInput, type MissionWorkspaceInput } from "@shield/team-system/workspace";
    import { HILL_READINESS_SCHEMA_VERSION, evaluateHillReadinessV1, type HillReadinessCandidateV1, type HillReadinessHostObservationV1 } from "@shield/team-system/hill-readiness";
    import { CONFIG_SCHEMA_V2_VERSION, CONFIG_SCHEMA_VERSION, LEGACY_CONFIG_SCHEMA_VERSION, SUPPORTED_CONFIG_SCHEMA_VERSIONS, configuredAdapterIds, migrateShieldConfig, type ConfiguredHostAdapterId, type DoctorReport, type DoctorReportV2, type RepositoryTrustProfileId, type ShieldConfig, type ShieldConfigV1, type ShieldConfigV2, type ShieldConfigV3 } from "@shield/team-system/config";
    import { RUNNER_JOURNAL_SCHEMA_VERSION, SUPERVISED_JOURNAL_SCHEMA_VERSION, createExecutionEffectEntry, createSupervisedMissionBrief, deriveRepositoryMissionBindings, selectCoulsonOperationBinding, type RunnerSupervisedEffectCandidate, type SupervisedMissionBrief } from "@shield/team-system/supervision";
    import { WHEELS_OFF_POLICY_ID, type WheelsOffDelegation } from "@shield/team-system/delegation";
    import { ADAPTER_CONTRACT_VERSION, type AdapterCandidateEnvelope } from "@shield/team-system/adapter";
    import { RUNNER_CONTRACT_VERSION, runRunnerCycle, type RunnerCycleInput } from "@shield/team-system/runner";
    import { PERMISSION_CONTRACT_VERSION, evaluatePermission, type RuntimeBinding } from "@shield/team-system/permission";
    import { loadSchema9PermissionContextV1, type Schema9PermissionContextInput, type Schema9PermissionContextResult } from "@shield/team-system/schema9-permission-context";
    import { runGovernedMayDispatchStepV1 } from "@shield/team-system/governed-may-dispatch";
    import { CANONICAL_ROLE_IDS, CANONICAL_ROLE_REGISTRY_V1, ROLE_TAXONOMY_CONTRACT_VERSION, isCanonicalRoleId, validateRoleAssignment, type CanonicalRoleId, type RoleAssignmentScope, type RoleRoute } from "@shield/team-system/roles";
    import { MISSION_PROFILE_CONTRACT_VERSION, type MissionProfileV1, type MissionRoleDefinitionV1, type MissionRoleId, MISSION_ROLE_IDS, CANONICAL_MISSION_ROLE_REGISTRY_V1 } from "@shield/team-system/mission-profile";
    import { type ProfileAwareProjectionV1 } from "@shield/team-system/profile-aware-mission";
    import { PERMISSION_AUDIT_SCHEMA_VERSION, replayPermissionAuditLedger, type PermissionAuditRecord } from "@shield/team-system/permission-audit";
    import { deriveMissionCycleIdentityV1, runMissionCycle, type MissionCycleInputV1, type MissionCycleResultV1 } from "@shield/team-system/mission-runtime";
    import { MISSION_BUILDER_CONTRACT_VERSION, buildMissionDefinitionV1, projectMissionStatusV1, type MissionDefinitionV1, type MissionAdvanceInputV1, type MissionStatusProjectionV1 } from "@shield/team-system/mission-builder";
    import { REVIEW_PUBLICATION_CONTRACT_VERSION, evaluateReviewPublicationV1, type ReviewPublicationAuthorityV1, type ReviewPublicationProposalV1 } from "@shield/team-system/review-publication";
    import { PIPELINE_PROFILE_CONTRACT_VERSION, selectPipelineModesV1, type RepositoryPipelineProfileV1 } from "@shield/team-system/pipeline";
    import { SONARQUBE_EVIDENCE_CONTRACT_VERSION, evaluateSonarQubeEvidenceV1, type SonarQubeEvidenceV1 } from "@shield/team-system/sonarqube";
    import { QA_MODE_CONTRACT_VERSION, createQaHandoffV0, evaluateQaValidationV0, type QaHandoffInputV0 } from "@shield/team-system/qa-mode";
    import { KNOWLEDGE_ENTRY_CONTRACT_VERSION, validateKnowledgeEntryV0, type KnowledgeEntryV0 } from "@shield/team-system/knowledge";
    import { runLocalToolSession, runMayControlLoop, runMayToolCall, type LocalToolSessionRequest, type MayControlLoopDependencies, type MayControlLoopRequest, type MayToolCallRequest, type MayToolExecutorDependencies } from "@shield/team-system/local-tools";
    import {
      FURY_PLAN_GATE_CONTRACT_VERSION,
      FURY_PLAN_REVIEW_EVIDENCE_CONTRACT_VERSION,
      createGitHubFollowUpCandidate,
      deliverGitHubCommunication,
      evaluateFuryPlanGateV1,
      evaluateFuryPlanReviewEvidenceV1,
      prepareDeliveryWorkspaceForDispatch,
      replayFuryPlanReviewEvidenceLedgerV1,
      renderMissionHandoff,
      validatePRWorkspaceReceipt,
      type DeliveryWorkspaceResult,
      type FuryPlanGateEnvelopeV1,
      type FuryPlanReviewEvidenceCandidateV1,
      type FuryPlanReviewEvidenceEvaluationV1,
      type GitHubFollowUpCandidateInput,
      type PRWorkspaceReceipt,
    } from "@shield/team-system/github";
    import {
      IMPLEMENTATION_AUTHORITY_CONTRACT_VERSION,
      IMPLEMENTATION_AUTHORITY_SCHEMA_VERSION,
      IMPLEMENTATION_AUTHORITY_KIND,
      type ImplementationAuthorityV1,
    } from "@shield/team-system/implementation-authority";
    import {
      FEATURE_OPERATION_CONTRACT_VERSION,
      FEATURE_OPERATION_CONTRACT_VERSION_V2,
      FEATURE_OPERATION_SCHEMA_VERSION,
      FEATURE_OPERATION_SCHEMA_VERSION_V2,
      evaluateFeatureOperationDerivedCandidateV1,
      evaluateFeatureOperationDerivedCandidateV2,
      type FeatureOperationActiveLeaseV1,
      type FeatureOperationDerivedCandidateV1,
      type FeatureOperationPlanV1,
      type FeatureOperationPlanV2,
      type FeatureOperationReplayContextV1,
      type FeatureOperationReplayContextV2,
      type SignedFeatureOperationAuthorityV1,
      type SignedFeatureOperationAuthorityV2,
    } from "@shield/team-system/feature-operation";
    import {
      FEATURE_INTEGRATION_CONTRACT_VERSION,
      FEATURE_INTEGRATION_CONTRACT_VERSION_V2,
      FEATURE_INTEGRATION_CONTROLLER_CONTRACT_VERSION,
      replayFeatureOperationJournalV1,
      secureReplayFeatureOperationJournalV2,
      runFeatureIntegrationControllerV1,
      type FeatureOperationJournalV1,
      type FeatureOperationJournalV2,
      type FeatureIntegrationTrustAnchorV2,
    } from "@shield/team-system/feature-integration";
    import {
      DAISY_COORDINATION_AUTHORITY_CONTRACT_VERSION,
      validateDaisyCoordinationAuthorityV1,
      type DaisyCoordinationAuthorityV1,
    } from "@shield/team-system/daisy-coordination-authority";
    import {
      claimSeatDispatchPacketV1,
      type SeatDispatchPacketClaimContractResultV1,
      type SeatDispatchPacketClaimFailureCodeV1,
      type SeatDispatchPacketClaimInputV1,
      type SeatDispatchPacketClaimResultV1,
      type SeatDispatchReceiptStoreAppendInput,
      type SeatDispatchReceiptStoreAppendResult,
      type SeatDispatchReceiptStoreByChildInput,
      type SeatDispatchReceiptStoreByParentInput,
      type SeatDispatchReceiptStoreByReceiptInput,
      type SeatDispatchReceiptStoreBySessionResult,
      type SeatDispatchStoreContractResult,
      type SeatDispatchReceiptStoreScopeInput,
    } from "@shield/team-system/dispatch-receipts";

    const schema: 2 = MISSION_SCHEMA_VERSION;
    const state: MissionState = "approved";
    const flags: RiskFlags = {
      production: false, destructive: false, migration: false,
      credentialsOrSecurity: false, externalCommunication: false,
      merge: false, deploy: false, release: false, hillHighRisk: false,
    };
    const risk = classifyMissionRisk(flags);
    const intakeContract: "mission.intake.v1" = MISSION_INTAKE_CONTRACT_VERSION;
    const intakeRequest = null as unknown as MissionIntakeRequestV1;
    const intakeResult: MissionIntakeResultV1 = missionIntakeV1(intakeRequest);
    const iterationEvidence = null as unknown as SpecialistIterationEvidenceV1;
    const iterationEvaluation = evaluateSpecialistIteration(iterationEvidence);
    const journalSchema: 1 = JOURNAL_SCHEMA_VERSION;
    const modeSchema: 1 = MODE_MANIFEST_SCHEMA_VERSION;
    const entry = null as unknown as JournalEntry;
    const manifest = null as unknown as ModeManifest;
    const input = null as unknown as MissionWorkspaceInput;
    const hillReadinessSchema: 1 = HILL_READINESS_SCHEMA_VERSION;
    const hillCandidate = null as unknown as HillReadinessCandidateV1;
    const hillObservation = null as unknown as HillReadinessHostObservationV1;
    const hillEvaluation = evaluateHillReadinessV1(hillCandidate, hillObservation);
    const legacyConfigSchema: 1 = LEGACY_CONFIG_SCHEMA_VERSION;
    const configSchemaV2: 2 = CONFIG_SCHEMA_V2_VERSION;
    const configSchema: 3 = CONFIG_SCHEMA_VERSION;
    const supportedConfigSchemas: readonly [1, 2, 3] = SUPPORTED_CONFIG_SCHEMA_VERSIONS;
    const config = null as unknown as ShieldConfig;
    const configV1 = null as unknown as ShieldConfigV1;
    const configV2 = null as unknown as ShieldConfigV2;
    const configV3 = null as unknown as ShieldConfigV3;
    const trustProfileId: RepositoryTrustProfileId = configV2.repositoryTrustProfileId;
    const configuredHostAdapterId: ConfiguredHostAdapterId = configV3.adapterIds[0];
    const projectedAdapters: ConfiguredHostAdapterId[] = configuredAdapterIds(config);
    const migratedConfig: ShieldConfigV3 = migrateShieldConfig(config);
    const doctorV1 = null as unknown as DoctorReport;
    const doctorV2 = null as unknown as DoctorReportV2;
    const doctorV1Version: 1 = doctorV1.reportVersion;
    const doctorV2Version: 2 = doctorV2.reportVersion;
    const legacySchemaDiscriminant: 1 = configV1.schemaVersion;
    const priorSchemaDiscriminant: 2 = configV2.schemaVersion;
    const currentSchemaDiscriminant: 3 = configV3.schemaVersion;
    const deriveBindings = deriveRepositoryMissionBindings;
    const selectCoulson = selectCoulsonOperationBinding;
    const supervisedSchema: 2 = SUPERVISED_JOURNAL_SCHEMA_VERSION;
    const runnerJournalSchema: 5 = RUNNER_JOURNAL_SCHEMA_VERSION;
    const supervisedBrief = null as unknown as SupervisedMissionBrief;
    const createBrief = createSupervisedMissionBrief;
    const runnerEffectCandidate = null as unknown as RunnerSupervisedEffectCandidate;
    const createEffectEntry = createExecutionEffectEntry;
    const wheelsOffPolicy: "wheels_off.v1" = WHEELS_OFF_POLICY_ID;
    const delegation = null as unknown as WheelsOffDelegation;
    const adapterContract: 1 = ADAPTER_CONTRACT_VERSION;
    const adapterCandidate = null as unknown as AdapterCandidateEnvelope;
    const runnerContract: 1 = RUNNER_CONTRACT_VERSION;
    const runnerInput = null as unknown as RunnerCycleInput;
    const permissionContract: 1 = PERMISSION_CONTRACT_VERSION;
    const runtimeBinding = null as unknown as RuntimeBinding;
    const evaluate = evaluatePermission;
    const schema9PermissionContextInput = null as unknown as Schema9PermissionContextInput;
    const schema9PermissionContextResult = null as unknown as Schema9PermissionContextResult;
    const loadSchema9Context = loadSchema9PermissionContextV1;
    const runGovernedMayDispatch = runGovernedMayDispatchStepV1;
    const auditSchema: 1 = PERMISSION_AUDIT_SCHEMA_VERSION;
    const auditRecord = null as unknown as PermissionAuditRecord;
    const replayAudit = replayPermissionAuditLedger;
    const runtimeCycleInput = null as unknown as MissionCycleInputV1;
    const runtimeCycleResult = null as unknown as MissionCycleResultV1;
    const runtimeIdentity = deriveMissionCycleIdentityV1(runtimeCycleInput);
    const runRuntimeCycle = runMissionCycle;
    const reviewPublicationContract: "review-publication.v1" = REVIEW_PUBLICATION_CONTRACT_VERSION;
    const reviewPublicationAuthority = null as unknown as ReviewPublicationAuthorityV1;
    const reviewPublicationProposal = null as unknown as ReviewPublicationProposalV1;
    const evaluateReviewPublication = evaluateReviewPublicationV1;
    const pipelineContract: "pipeline.profile.v1" = PIPELINE_PROFILE_CONTRACT_VERSION;
    interface CompatibleProfileProjection extends ProfileAwareProjectionV1 { consumerTag: "compatible" }
    const compatibleProfileProjection = null as unknown as CompatibleProfileProjection;
    const compatibleProfileTag: "compatible" = compatibleProfileProjection.consumerTag;
    const pipelineProfile = null as unknown as RepositoryPipelineProfileV1;
    const selectPipeline = selectPipelineModesV1;
    const sonarContract: "sonarqube.evidence.v1" = SONARQUBE_EVIDENCE_CONTRACT_VERSION;
    const sonarEvidence = null as unknown as SonarQubeEvidenceV1;
    const evaluateSonar = evaluateSonarQubeEvidenceV1;
    const localToolRequest = null as unknown as LocalToolSessionRequest;
    const runTools = runLocalToolSession;
    const mayToolRequest = null as unknown as MayToolCallRequest;
    const mayToolDependencies = null as unknown as MayToolExecutorDependencies;
    const runMayTools = runMayToolCall;
    const mayLoopRequest = null as unknown as MayControlLoopRequest;
    const mayLoopDependencies = null as unknown as MayControlLoopDependencies;
    const runMayLoop = runMayControlLoop;
    const runCycle = runRunnerCycle;
    const deliver = deliverGitHubCommunication;
    const followUpInput = null as unknown as GitHubFollowUpCandidateInput;
    const createFollowUp = createGitHubFollowUpCandidate;
    const prepareWorkspace = prepareDeliveryWorkspaceForDispatch;
    const furyContract: "fury.plan-gate.v1" = FURY_PLAN_GATE_CONTRACT_VERSION;
    const furyGate = null as unknown as FuryPlanGateEnvelopeV1;
    const evaluateFury = evaluateFuryPlanGateV1;
    const furyEvidenceContract: "fury.plan-review-evidence.v1" = FURY_PLAN_REVIEW_EVIDENCE_CONTRACT_VERSION;
    const furyEvidenceCandidate = null as unknown as FuryPlanReviewEvidenceCandidateV1;
    const furyEvidenceEvaluation: FuryPlanReviewEvidenceEvaluationV1 = evaluateFuryPlanReviewEvidenceV1(
      furyEvidenceCandidate, [], [], null,
    );
    const implementationAuthoritySchema: 1 = IMPLEMENTATION_AUTHORITY_SCHEMA_VERSION;
    const implementationAuthorityContract: "implementation-authority.v1" = IMPLEMENTATION_AUTHORITY_CONTRACT_VERSION;
    const implementationAuthorityKind: "wheels_up" = IMPLEMENTATION_AUTHORITY_KIND;
    const authority: ImplementationAuthorityV1 = null as unknown as ImplementationAuthorityV1;
    const featureOperationSchema: 1 = FEATURE_OPERATION_SCHEMA_VERSION;
    const featureOperationContract: "feature.operation.v1" = FEATURE_OPERATION_CONTRACT_VERSION;
    const featureOperationPlan = null as unknown as FeatureOperationPlanV1;
    const featureOperationAuthority = null as unknown as SignedFeatureOperationAuthorityV1;
    const featureOperationReplay = null as unknown as FeatureOperationReplayContextV1;
    const featureOperationActiveLease = null as unknown as FeatureOperationActiveLeaseV1;
    const featureOperationCandidate = null as unknown as FeatureOperationDerivedCandidateV1;
    const evaluateFeatureOperation = evaluateFeatureOperationDerivedCandidateV1;
    const featureOperationSchemaV2: 2 = FEATURE_OPERATION_SCHEMA_VERSION_V2;
    const featureOperationContractV2: "feature.operation.v2" = FEATURE_OPERATION_CONTRACT_VERSION_V2;
    const featureOperationPlanV2: FeatureOperationPlanV2 = {
      ...featureOperationPlan,
      schemaVersion: 2,
      contractVersion: "feature.operation.v2",
      protocol: {
        version: 2,
        observationProducerBindingsDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
        humanBindingsDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      },
      finalGates: { policyVersion: 2, fitzRequired: true, simmonsRequired: false, coulsonRequired: true },
    };
    const featureOperationAuthorityV2 = null as unknown as SignedFeatureOperationAuthorityV2;
    const featureOperationReplayV2 = null as unknown as FeatureOperationReplayContextV2;
    const evaluateFeatureOperationV2 = evaluateFeatureOperationDerivedCandidateV2;
    const featureIntegrationContractV2: "feature.integration.v2" = FEATURE_INTEGRATION_CONTRACT_VERSION_V2;
    const featureJournalV1 = null as unknown as FeatureOperationJournalV1;
    const featureJournalV2 = null as unknown as FeatureOperationJournalV2;
    const featureTrustAnchorV2 = null as unknown as FeatureIntegrationTrustAnchorV2;
    const secureReplayV2 = secureReplayFeatureOperationJournalV2;
    const daisyAuthorityContract: "daisy-coordination-authority.v1" = DAISY_COORDINATION_AUTHORITY_CONTRACT_VERSION;
    const daisyAuthority: DaisyCoordinationAuthorityV1 = null as unknown as DaisyCoordinationAuthorityV1;
    const validateDaisyAuthority = validateDaisyCoordinationAuthorityV1;
    const replayFuryEvidence = replayFuryPlanReviewEvidenceLedgerV1;
    const validateReceipt = validatePRWorkspaceReceipt;
    const renderHandoff = renderMissionHandoff;
    const workspaceReceipt = null as unknown as PRWorkspaceReceipt;
    const workspaceResult = null as unknown as DeliveryWorkspaceResult;
    const verifiedPublicationAction:
      Extract<DeliveryWorkspaceResult, { state: "dispatch_ready" }>["publicationAction"] =
        "verified_existing_draft_pr";
    const dispatchScope: SeatDispatchReceiptStoreScopeInput = {
      repositoryRoot: "/tmp/dispatch-store",
      repositoryId: "repo-1",
      repositoryWorkspaceId: "workspace-1",
    };
    const dispatchAppendInput: SeatDispatchReceiptStoreAppendInput = {
      ...dispatchScope,
      event: null as unknown as SeatDispatchReceiptStoreAppendInput["event"],
      lockOwnerId: "owner-1",
    };
    const dispatchByReceiptInput: SeatDispatchReceiptStoreByReceiptInput = {
      ...dispatchScope,
      receiptId: "receipt-1",
    };
    const dispatchByParentInput: SeatDispatchReceiptStoreByParentInput = {
      ...dispatchScope,
      parentMissionId: "mission-1",
      parentSessionId: "session-1",
    };
    const dispatchByChildInput: SeatDispatchReceiptStoreByChildInput = {
      ...dispatchScope,
      childTaskId: "task-1",
      childSessionId: "child-session-1",
    };
    const dispatchBySessionResult: SeatDispatchReceiptStoreBySessionResult = {
      logPath: "/tmp/dispatch-store/.shield/dispatch-receipts.jsonl",
      receipts: [],
    };
    const dispatchAppendResult: SeatDispatchStoreContractResult<SeatDispatchReceiptStoreAppendResult> = {
      state: "invalid",
      code: "test",
      errors: ["expected"],
    };
    const packetClaimInput = null as unknown as SeatDispatchPacketClaimInputV1;
    const packetClaimResult = null as unknown as SeatDispatchPacketClaimResultV1;
    const packetClaimFailure: SeatDispatchPacketClaimFailureCodeV1 = "output_evidence_misplacement";
    const packetClaimContract: SeatDispatchPacketClaimContractResultV1 = {
      state: "invalid",
      code: packetClaimFailure,
      errors: ["expected"],
    };
    const claimPacket = claimSeatDispatchPacketV1;
    function assertPacketClaimNarrowing(outcome: SeatDispatchPacketClaimContractResultV1): void {
      if (outcome.state === "valid") {
        if (outcome.value.claimStatus === "claimed") {
          const disposition: "execute_once" = outcome.value.executionDisposition;
          void disposition;
        } else {
          // @ts-expect-error already_claimed does not expose an executable disposition.
          const forbiddenDisposition: "execute_once" = outcome.value.executionDisposition;
          void forbiddenDisposition;
        }
      } else {
        // @ts-expect-error invalid outcomes do not expose a claim value.
        const invalidValue: SeatDispatchPacketClaimResultV1 = outcome.value;
        // @ts-expect-error invalid outcomes do not expose executionDisposition.
        const invalidDisposition = outcome.value.executionDisposition;
        void [invalidValue, invalidDisposition];
      }
    }
    const roleTaxonomyContract: "roles.v1" = ROLE_TAXONOMY_CONTRACT_VERSION;
    const dispatchSeatOnly: RoleAssignmentScope = "dispatch";
    const route: RoleRoute = "dispatch_seat";
    const validatedRole: MissionProfileV1["contractVersion"] = MISSION_PROFILE_CONTRACT_VERSION;
    const canonicalRole: CanonicalRoleId = CANONICAL_ROLE_IDS[0];
    const profileRole: MissionRoleId = "coulson";
    const profileRoleContract: "mission.profile.v1" = MISSION_PROFILE_CONTRACT_VERSION;
    const profileRoleDiscriminant: MissionProfileV1["contractVersion"] = MISSION_PROFILE_CONTRACT_VERSION;
    const legacyRoleDefinition: MissionRoleDefinitionV1 = CANONICAL_MISSION_ROLE_REGISTRY_V1[0];
    const legacyRoleKind: "human_authority" = legacyRoleDefinition.kind;
    const legacyProfileRole: MissionRoleId = MISSION_ROLE_IDS[0];
    const legacyProfileRoleRegistry: CanonicalRoleId = CANONICAL_MISSION_ROLE_REGISTRY_V1[0].roleId;
    const firstCanonicalRole = CANONICAL_ROLE_REGISTRY_V1[0];
    const isKnownRole: boolean = isCanonicalRoleId("may");
    const assignment = validateRoleAssignment("may", dispatchSeatOnly, { requireV03Enabled: true });
    const canDispatch = assignment.state === "valid" && assignment.value === "may";
    validateMissionWorkspaceInput(input);
    const validResume: MissionDecisionEvent = {
      schemaVersion: 2, eventId: "event-1", missionId: "mission-1", sequence: 1,
      type: "mission.decision", actor: "coulson", previousState: "paused",
      resultingState: "approved", timestamp: { value: "2026-07-18T18:00:00Z", provenance: "humanRecorded" },
      decision: "resume", resumeState: "approved",
    };
    // @ts-expect-error A resume decision requires an explicit resumeState.
    const missingResumeState: MissionDecisionEvent = { ...validResume, resumeState: undefined };
    // @ts-expect-error A non-resume decision cannot carry resumeState.
    const unexpectedResumeState: MissionDecisionEvent = { ...validResume, decision: "approve" };
    const qaContract: "qa.mode.v0" = QA_MODE_CONTRACT_VERSION;
    const qaHandoff = null as unknown as QaHandoffInputV0;
    const knowledgeContract: "knowledge.entry.v0" = KNOWLEDGE_ENTRY_CONTRACT_VERSION;
    const knowledgeEntry = null as unknown as KnowledgeEntryV0;
  void [schema, state, risk, intakeContract, intakeRequest, intakeResult, iterationEvidence, iterationEvaluation, journalSchema, modeSchema, entry, manifest, hillReadinessSchema, hillCandidate, hillObservation, hillEvaluation, legacyConfigSchema, configSchema, supportedConfigSchemas, config, configV1, configV2, trustProfileId, legacySchemaDiscriminant, currentSchemaDiscriminant, deriveBindings, selectCoulson, supervisedSchema, runnerJournalSchema, supervisedBrief, createBrief, runnerEffectCandidate, createEffectEntry, wheelsOffPolicy, delegation, adapterContract, adapterCandidate, runnerContract, runnerInput, permissionContract, runtimeBinding, evaluate, schema9PermissionContextInput, schema9PermissionContextResult, loadSchema9Context, auditSchema, auditRecord, replayAudit, reviewPublicationContract, reviewPublicationAuthority, reviewPublicationProposal, evaluateReviewPublication, pipelineContract, pipelineProfile, selectPipeline, sonarContract, sonarEvidence, evaluateSonar, qaContract, qaHandoff, createQaHandoffV0, evaluateQaValidationV0, knowledgeContract, knowledgeEntry, validateKnowledgeEntryV0, localToolRequest, runTools, mayToolRequest, mayToolDependencies, runMayTools, mayLoopRequest, mayLoopDependencies, runMayLoop, runCycle, deliver, followUpInput, createFollowUp, prepareWorkspace, furyContract, furyGate, evaluateFury, furyEvidenceContract, furyEvidenceCandidate, furyEvidenceEvaluation, implementationAuthorityContract, implementationAuthoritySchema, implementationAuthorityKind, authority, replayFuryEvidence, validateReceipt, renderHandoff, workspaceReceipt, workspaceResult, dispatchScope, dispatchAppendInput, dispatchAppendResult, dispatchByReceiptInput, dispatchByParentInput, dispatchByChildInput, dispatchBySessionResult, packetClaimInput, packetClaimResult, packetClaimContract, claimPacket, assertPacketClaimNarrowing, validResume, missingResumeState, unexpectedResumeState, roleTaxonomyContract, dispatchSeatOnly, route, validatedRole, canonicalRole, profileRole, profileRoleContract, profileRoleDiscriminant, legacyRoleDefinition, legacyRoleKind, legacyProfileRole, legacyProfileRoleRegistry, firstCanonicalRole, isKnownRole, canDispatch];
  `);

  const tsc = join(workspaceRoot, "node_modules", "typescript", "bin", "tsc");
  execFileSync(process.execPath, [tsc, "--project", join(fixture, "tsconfig.json")], {
    cwd: fixture,
    stdio: "pipe",
  });

  const bin = join(fixture, "node_modules", ".bin", "shield");
  execFileSync(bin, [
    "init",
    "--repository-id", "fixture/typescript-consumer",
    "--coulson-binding-ref", "github:user:coulson",
    "--fitz-binding-ref", "github:user:fitz",
  ], { cwd: fixture, stdio: "pipe" });
  const doctor = JSON.parse(execFileSync(bin, ["doctor", "--json"], {
    cwd: fixture,
    encoding: "utf8",
  }));
  assert.equal(doctor.ok, true);
  const opsBin = join(fixture, "node_modules", ".bin", "shield-ops");
  const opsHelp = execFileSync(opsBin, ["--help"], { cwd: fixture, encoding: "utf8" });
  assert.match(opsHelp, /advisory structural consistency only/u);
  assert.match(opsHelp, /gateEligible:false/u);
  assert.match(opsHelp, /shield-ops flight status/u);
  const flightHelp = execFileSync(opsBin, ["flight", "status", "--help"], { cwd: fixture, encoding: "utf8" });
  assert.match(flightHelp, /--expected-plan-sha256/u);
  assert.match(flightHelp, /--expected-predecessor-sha256/u);

  const javascriptFixture = await mkdtemp(join(tmpdir(), "shield-js-consumer-"));
  execFileSync("git", ["init", "--quiet"], { cwd: javascriptFixture });
  await writeFile(join(javascriptFixture, "package.json"), "{\"private\":true,\"type\":\"module\"}\n");
  execFileSync(
    "npm",
    ["install", "--save-dev", "--save-exact", tarball, "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", "--cache", npmCache],
    { cwd: javascriptFixture, stdio: "pipe" },
  );
  await writeFile(join(javascriptFixture, "consumer.mjs"), `
    import { appendSeatDispatchReceiptEntryV1, claimSeatDispatchPacketV1, readSeatDispatchReceiptByReceiptIdV1, readSeatDispatchReceiptsByChildTaskSessionV1, readSeatDispatchReceiptsByParentMissionSessionV1, SEAT_DISPATCH_RECEIPTS_LOG_RELATIVE_PATH } from "@shield/team-system/dispatch-receipts";
    import { CONFIG_SCHEMA_VERSION, configuredAdapterIds, createShieldConfig, migrateShieldConfig } from "@shield/team-system/config";
    const packageBase = new URL("./node_modules/@shield/team-system/", import.meta.url);
    await import(new URL("dist/dispatch-receipts.mjs", packageBase).href);
    await import(new URL("dist/seat-dispatch-store.mjs", packageBase).href);
    await import(new URL("dist/seat-dispatch-receipt-v1.mjs", packageBase).href);
    await import(new URL("dist/implementation-authority-v1.mjs", packageBase).href);
    if (SEAT_DISPATCH_RECEIPTS_LOG_RELATIVE_PATH !== ".shield/dispatch-receipts.jsonl") throw new Error("unexpected dispatch receipt log path");
    const parentResult = await readSeatDispatchReceiptsByParentMissionSessionV1({
      repositoryRoot: "/tmp/dispatch-store",
      repositoryId: "repo-1",
      repositoryWorkspaceId: "workspace-1",
      parentMissionId: "mission-1",
      parentSessionId: "session-1",
    });
    const childResult = await readSeatDispatchReceiptsByChildTaskSessionV1({
      repositoryRoot: "/tmp/dispatch-store",
      repositoryId: "repo-1",
      repositoryWorkspaceId: "workspace-1",
      childTaskId: "task-1",
      childSessionId: "child-session-1",
    });
    const byReceiptResult = await readSeatDispatchReceiptByReceiptIdV1({
      repositoryRoot: "/tmp/dispatch-store",
      repositoryId: "repo-1",
      repositoryWorkspaceId: "workspace-1",
      receiptId: "receipt-1",
    });
    if (parentResult.state !== "invalid" || childResult.state !== "invalid" || byReceiptResult.state !== "invalid") {
      throw new Error("unexpected dispatch-receipts query states");
    }
    if (typeof appendSeatDispatchReceiptEntryV1 !== "function" || typeof claimSeatDispatchPacketV1 !== "function" || typeof readSeatDispatchReceiptByReceiptIdV1 !== "function") {
      throw new Error("dispatch-receipts exports missing");
    }
    if (CONFIG_SCHEMA_VERSION !== 3) throw new Error("unexpected config schema");
    const config = createShieldConfig({
      repositoryId: "fixture/javascript-consumer",
      coulsonBindingRef: "github:user:coulson",
      fitzBindingRef: "github:user:fitz",
    });
    if (configuredAdapterIds(config)[0] !== "github" || migrateShieldConfig(config).schemaVersion !== 3 || config.repositoryTrustProfileId !== "signed_human_gates") throw new Error("unexpected adapter or trust profile");
  `);
  execFileSync(process.execPath, [join(javascriptFixture, "consumer.mjs")], {
    cwd: javascriptFixture,
    stdio: "pipe",
  });
});
