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
    "./permission-audit",
    "./sonarqube",
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
  const permissionAudit = await import("@shield/team-system/permission-audit");
  const sonarqube = await import("@shield/team-system/sonarqube");
  const localTools = await import("@shield/team-system/local-tools");
  const github = await import("@shield/team-system/github");

  assert.equal(root.MISSION_SCHEMA_VERSION, 2);
  assert.equal(mission.classifyMissionRisk, root.classifyMissionRisk);
  assert.equal(typeof mission.evaluateSpecialistIteration, "function");
  assert.equal(journal.JOURNAL_SCHEMA_VERSION, 1);
  assert.equal(modes.MODE_MANIFEST_SCHEMA_VERSION, 1);
  assert.equal(typeof workspace.validateMissionWorkspaceInput, "function");
  assert.equal(hillReadiness.HILL_READINESS_RUBRIC_VERSION, "hill.readiness.v1");
  assert.equal(typeof hillReadiness.evaluateHillReadinessV1, "function");
  assert.equal(config.CONFIG_SCHEMA_VERSION, 1);
  assert.equal(root.validateShieldConfig, config.validateShieldConfig);
  assert.equal(supervision.SUPERVISED_JOURNAL_SCHEMA_VERSION, 2);
  assert.equal(supervision.RUNNER_JOURNAL_SCHEMA_VERSION, 5);
  assert.equal(typeof supervision.createSupervisedMissionBrief, "function");
  assert.equal(typeof supervision.createExecutionEffectEntry, "function");
  assert.equal(delegation.WHEELS_OFF_POLICY_ID, "wheels_off.v1");
  assert.equal(adapter.ADAPTER_CONTRACT_VERSION, 1);
  assert.equal(typeof adapter.validateAdapterCandidate, "function");
  assert.equal(runner.RUNNER_CONTRACT_VERSION, 1);
  assert.equal(typeof runner.runRunnerCycle, "function");
  assert.equal(permission.PERMISSION_CONTRACT_VERSION, 1);
  assert.equal(typeof permission.evaluatePermission, "function");
  assert.equal(permissionAudit.PERMISSION_AUDIT_SCHEMA_VERSION, 1);
  assert.equal(typeof permissionAudit.replayPermissionAuditLedger, "function");
  assert.equal(sonarqube.SONARQUBE_EVIDENCE_CONTRACT_VERSION, "sonarqube.evidence.v1");
  assert.equal(typeof sonarqube.evaluateSonarQubeEvidenceV1, "function");
  assert.equal(typeof localTools.runLocalToolSession, "function");
  assert.equal(localTools.DAISY_TOOL_DEFINITIONS.length, 3);
  assert.equal(typeof localTools.runMayToolCall, "function");
  assert.equal(localTools.MAY_TOOL_DEFINITIONS.length, 2);
  assert.equal(typeof github.deliverGitHubCommunication, "function");
  assert.equal(typeof github.prepareDeliveryWorkspaceForDispatch, "function");
  assert.equal(github.FURY_PLAN_GATE_CONTRACT_VERSION, "fury.plan-gate.v1");
  assert.equal(typeof github.evaluateFuryPlanGateV1, "function");
  assert.equal(typeof github.validatePRWorkspaceReceipt, "function");
  assert.equal(typeof github.renderMissionHandoff, "function");
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
    ["pack", packageRoot, "--json", "--pack-destination", fixture, "--cache", npmCache],
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
    "dist/mission-v2.mjs",
    "dist/mission-v2.d.mts",
    "dist/delegation-v1.mjs",
    "dist/delegation-v1.d.mts",
    "dist/adapter-v1.mjs",
    "dist/adapter-v1.d.mts",
    "dist/runner-v1.mjs",
    "dist/runner-v1.d.mts",
    "dist/permission-v1.mjs",
    "dist/permission-v1.d.mts",
    "dist/permission-audit-v1.mjs",
    "dist/permission-audit-v1.d.mts",
    "dist/sonarqube-evidence-v1.mjs",
    "dist/sonarqube-evidence-v1.d.mts",
    "public/local-tools.mjs",
    "public/local-tools.d.mts",
    "scripts/model/may-tool-executor.mjs",
    "github/adapter-v1.mjs",
    "github/delivery-workspace.mjs",
    "github/pr-workspace.mjs",
    "public/github.mjs",
    "public/github.d.mts",
    "dist/cli.mjs",
    "INSTALLATION.md",
    "PUBLIC_API.md",
    "SUPERVISED_MISSION.md",
    "WHEELS_OFF.md",
    "PERMISSION_BOUNDARY.md",
  ]) {
    assert.ok(packedPaths.has(path), `packed artifact is missing ${path}`);
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
    import { JOURNAL_SCHEMA_VERSION, type JournalEntry } from "@shield/team-system/journal";
    import { MODE_MANIFEST_SCHEMA_VERSION, type ModeManifest } from "@shield/team-system/modes";
    import { validateMissionWorkspaceInput, type MissionWorkspaceInput } from "@shield/team-system/workspace";
    import { HILL_READINESS_SCHEMA_VERSION, evaluateHillReadinessV1, type HillReadinessCandidateV1, type HillReadinessHostObservationV1 } from "@shield/team-system/hill-readiness";
    import { CONFIG_SCHEMA_VERSION, type ShieldConfig } from "@shield/team-system/config";
    import { RUNNER_JOURNAL_SCHEMA_VERSION, SUPERVISED_JOURNAL_SCHEMA_VERSION, createExecutionEffectEntry, createSupervisedMissionBrief, type RunnerSupervisedEffectCandidate, type SupervisedMissionBrief } from "@shield/team-system/supervision";
    import { WHEELS_OFF_POLICY_ID, type WheelsOffDelegation } from "@shield/team-system/delegation";
    import { ADAPTER_CONTRACT_VERSION, type AdapterCandidateEnvelope } from "@shield/team-system/adapter";
    import { RUNNER_CONTRACT_VERSION, runRunnerCycle, type RunnerCycleInput } from "@shield/team-system/runner";
    import { PERMISSION_CONTRACT_VERSION, evaluatePermission, type RuntimeBinding } from "@shield/team-system/permission";
    import { PERMISSION_AUDIT_SCHEMA_VERSION, replayPermissionAuditLedger, type PermissionAuditRecord } from "@shield/team-system/permission-audit";
    import { SONARQUBE_EVIDENCE_CONTRACT_VERSION, evaluateSonarQubeEvidenceV1, type SonarQubeEvidenceV1 } from "@shield/team-system/sonarqube";
    import { runLocalToolSession, runMayToolCall, type LocalToolSessionRequest, type MayToolCallRequest, type MayToolExecutorDependencies } from "@shield/team-system/local-tools";
    import {
      FURY_PLAN_GATE_CONTRACT_VERSION,
      deliverGitHubCommunication,
      evaluateFuryPlanGateV1,
      prepareDeliveryWorkspaceForDispatch,
      renderMissionHandoff,
      validatePRWorkspaceReceipt,
      type DeliveryWorkspaceResult,
      type FuryPlanGateEnvelopeV1,
      type JournaledCommunicationRequest,
      type PRWorkspaceReceipt,
    } from "@shield/team-system/github";

    const schema: 2 = MISSION_SCHEMA_VERSION;
    const state: MissionState = "approved";
    const flags: RiskFlags = {
      production: false, destructive: false, migration: false,
      credentialsOrSecurity: false, externalCommunication: false,
      merge: false, deploy: false, release: false, hillHighRisk: false,
    };
    const risk = classifyMissionRisk(flags);
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
    const configSchema: 1 = CONFIG_SCHEMA_VERSION;
    const config = null as unknown as ShieldConfig;
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
    const auditSchema: 1 = PERMISSION_AUDIT_SCHEMA_VERSION;
    const auditRecord = null as unknown as PermissionAuditRecord;
    const replayAudit = replayPermissionAuditLedger;
    const sonarContract: "sonarqube.evidence.v1" = SONARQUBE_EVIDENCE_CONTRACT_VERSION;
    const sonarEvidence = null as unknown as SonarQubeEvidenceV1;
    const evaluateSonar = evaluateSonarQubeEvidenceV1;
    const localToolRequest = null as unknown as LocalToolSessionRequest;
    const runTools = runLocalToolSession;
    const mayToolRequest = null as unknown as MayToolCallRequest;
    const mayToolDependencies = null as unknown as MayToolExecutorDependencies;
    const runMayTools = runMayToolCall;
    const runCycle = runRunnerCycle;
    const journaledRequest = null as unknown as JournaledCommunicationRequest;
    const deliver = deliverGitHubCommunication;
    const prepareWorkspace = prepareDeliveryWorkspaceForDispatch;
    const furyContract: "fury.plan-gate.v1" = FURY_PLAN_GATE_CONTRACT_VERSION;
    const furyGate = null as unknown as FuryPlanGateEnvelopeV1;
    const evaluateFury = evaluateFuryPlanGateV1;
    const validateReceipt = validatePRWorkspaceReceipt;
    const renderHandoff = renderMissionHandoff;
    const workspaceReceipt = null as unknown as PRWorkspaceReceipt;
    const workspaceResult = null as unknown as DeliveryWorkspaceResult;
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
    void [schema, state, risk, iterationEvidence, iterationEvaluation, journalSchema, modeSchema, entry, manifest, hillReadinessSchema, hillCandidate, hillObservation, hillEvaluation, configSchema, config, supervisedSchema, runnerJournalSchema, supervisedBrief, createBrief, runnerEffectCandidate, createEffectEntry, wheelsOffPolicy, delegation, adapterContract, adapterCandidate, runnerContract, runnerInput, permissionContract, runtimeBinding, evaluate, auditSchema, auditRecord, replayAudit, sonarContract, sonarEvidence, evaluateSonar, localToolRequest, runTools, mayToolRequest, mayToolDependencies, runMayTools, runCycle, journaledRequest, deliver, prepareWorkspace, furyContract, furyGate, evaluateFury, validateReceipt, renderHandoff, workspaceReceipt, workspaceResult, validResume, missingResumeState, unexpectedResumeState];
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

  const javascriptFixture = await mkdtemp(join(tmpdir(), "shield-js-consumer-"));
  execFileSync("git", ["init", "--quiet"], { cwd: javascriptFixture });
  await writeFile(join(javascriptFixture, "package.json"), "{\"private\":true,\"type\":\"module\"}\n");
  execFileSync(
    "npm",
    ["install", "--save-dev", "--save-exact", tarball, "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", "--cache", npmCache],
    { cwd: javascriptFixture, stdio: "pipe" },
  );
  await writeFile(join(javascriptFixture, "consumer.mjs"), `
    import { CONFIG_SCHEMA_VERSION, createShieldConfig } from "@shield/team-system/config";
    if (CONFIG_SCHEMA_VERSION !== 1) throw new Error("unexpected config schema");
    const config = createShieldConfig({
      repositoryId: "fixture/javascript-consumer",
      coulsonBindingRef: "github:user:coulson",
      fitzBindingRef: "github:user:fitz",
    });
    if (config.adapterId !== "github") throw new Error("unexpected adapter");
  `);
  execFileSync(process.execPath, [join(javascriptFixture, "consumer.mjs")], {
    cwd: javascriptFixture,
    stdio: "pipe",
  });
});
