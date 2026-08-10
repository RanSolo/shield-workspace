import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile as execFileCallback, spawnSync } from "node:child_process";
import { chmod, link, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { canonicalJson } from "../dist/mission-v2.mjs";
import { validateRunnerPermissionDecision } from "../dist/runner-v1.mjs";
import { createFeatureFlightAdapterV1 } from "../../../benchmarks/v0.3-external-acceptance-v1/feature-flight-adapter.mjs";
import {
  FEATURE_FLIGHT_RUN_MANIFEST_CONTRACT,
  FEATURE_FLIGHT_RUN_MANIFEST_VERSION,
  deriveFeatureFlightProvingTupleV1,
  parseFeatureFlightRunArguments,
  runFeatureFlightProductionV1,
} from "../scripts/operations/feature-flight-run.mjs";
import { canonicalFeatureFlightBytes } from "../scripts/operations/feature-flight-recovery.mjs";

const execFile = promisify(execFileCallback);
const testRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const fixtureRoot = join(testRoot, "benchmarks/v0.3-external-acceptance-v1");
const adapterPath = join(fixtureRoot, "feature-flight-adapter.mjs");
const fixtureIdentityPath = join(fixtureRoot, "fixture-identity-v1.json");
const cli = join(testRoot, "packages/shield-team-system/scripts/operations/ops-cli.mjs");
const loader = join(testRoot, "packages/shield-team-system/tests/fixtures/esm-loader.mjs");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function git(cwd, args) {
  return (await execFile("git", ["-C", cwd, ...args], { encoding: "utf8" })).stdout.trim();
}

function planValue(parent, worktree, baseRevision) {
  return {
    schemaVersion: 1,
    planType: "feature-flight-resolved-plan",
    prototype: {
      name: "flight-prep",
      version: "1.0.0",
      authority: "none",
      notice: "Planning output only. This artifact grants no mission authority or repository effect.",
    },
    flightId: "mission:production-proving:1",
    objective: "Run one signed Daisy proving preflight.",
    sourceIssue: "#251",
    repository: {
      root: parent,
      remoteUrl: null,
      baseRef: "main",
      baseRevision,
      inspectedHead: baseRevision,
      inspectedBranch: "main",
      inspectedWorktreeClean: true,
      collisions: [],
    },
    integration: { branch: "flight/integration", status: "declared-not-created" },
    lanes: [{ id: "lane-daisy", chatLabel: "Daisy", teamLabel: "Daisy" }],
    missions: [{
      id: "mission:execution-251",
      slug: "mission-execution-251",
      title: "Daisy external acceptance preflight",
      library: "team-system",
      lane: "lane-daisy",
      branch: "agent/issue-251",
      worktree,
      activationWave: 1,
      dependsOn: [],
      writablePaths: ["packages/shield-team-system/**"],
      scope: "Read-only coordination.",
      deliverables: ["One terminal preflight."],
      dependencyLevel: 0,
      initialEligibility: "eligible-after-independent-authorization",
      constructionStatus: "planned-not-created",
      authorityStatus: "not-initialized",
    }],
    evaluationContract: { fixtureId: "fixture:v0.3:external-acceptance:1", version: 1, scorecard: ["preflight"] },
  };
}

function stateValue(plan, planIdentity, status, sequence, predecessorSha256, head) {
  return {
    schemaVersion: 2,
    stateType: "non-authoritative-flight-state",
    authority: "none",
    notice: "Observed coordination state only. Lifecycle status and authorityEvidence do not grant or prove SHIELD or human authority.",
    flightId: plan.flightId,
    plan: planIdentity,
    sequence,
    predecessorSha256,
    repository: {
      root: plan.repository.root,
      baseRef: plan.repository.baseRef,
      baseRevision: plan.repository.baseRevision,
      integrationBranch: plan.integration.branch,
    },
    wave: { current: 1 },
    lanes: { "lane-daisy": { activeMissionId: status === "active" ? "mission:execution-251" : null } },
    missions: { "mission:execution-251": { lane: "lane-daisy", activationWave: 1, status, revision: head, authorityEvidence: null } },
    observedAt: `2026-08-10T22:00:0${sequence}.000Z`,
    tool: { name: sequence === 0 ? "flight-state-init" : "flight-state-successor-recorder", version: "1.0.0" },
  };
}

function runnerInput(effectKey) {
  const mode = { modeId: "reconnaissance", modeVersion: "1.0.0", seatId: "daisy", activationSource: "mission-brief" };
  const revision = "f".repeat(64);
  return {
    runnerContractVersion: 1,
    projection: {
      runnerContractVersion: 1,
      journalSchemaVersion: 9,
      missionId: "mission:execution-251",
      subjectId: "github:owner/repo/issue/251",
      revisionId: revision,
      evaluatedThroughSequence: 9,
      governanceState: "approved",
      missionAuthorizationState: "authorized",
      executionStatus: "running",
      executeReadiness: "ready",
      participantSeatIds: ["hill", "daisy", "coulson"],
      activatedModes: [mode],
      effectRecords: [],
    },
    resolvedModeContext: { runnerContractVersion: 1, seatId: "daisy", modes: [mode] },
    actionAllowlist: ["action:feature-flight.daisy.reconnaissance"],
    plan: {
      runnerContractVersion: 1,
      cycleId: "cycle:production-proving:1",
      missionId: "mission:execution-251",
      subjectId: "github:owner/repo/issue/251",
      revisionId: revision,
      evaluatedThroughSequence: 9,
      seatId: "daisy",
      activatedModes: [mode],
      actionId: "action:feature-flight.daisy.reconnaissance",
      effectClass: "coordination",
      effectKey,
      validationId: "validation:feature-flight.daisy-result-v1",
      stopCondition: "after_one_cycle",
    },
  };
}

function intentFromRunner(runner) {
  const plan = { ...runner.plan };
  delete plan.effectKey;
  return {
    runnerContractVersion: runner.runnerContractVersion,
    projection: runner.projection,
    resolvedModeContext: runner.resolvedModeContext,
    actionAllowlist: runner.actionAllowlist,
    plan,
  };
}

function permissionResult({ claimRoot, head, effectKey, approvedReadRoots }) {
  const binding = {
    bindingSchemaVersion: 1,
    bindingId: "binding:daisy:production-proving:1",
    bindingVersion: 1,
    missionId: "mission:execution-251",
    subjectId: "github:owner/repo/issue/251",
    missionRevisionId: "f".repeat(64),
    seatId: "daisy",
    reasoningRuntimeId: "runtime:daisy-production",
    toolExecutorId: "executor:daisy-production",
    repositoryId: "owner/repo",
    canonicalWritableRoot: claimRoot,
    branch: "agent/issue-251",
    artifactRevisionId: head,
    recordedAtSequence: 9,
    activeThroughSequence: null,
    lifecycleState: "active",
    approvedScope: {
      actionIds: ["action:feature-flight.daisy.reconnaissance"],
      effectClasses: ["coordination"],
      effectKeys: [effectKey],
      capabilities: ["read_only_coordination"],
    },
    coulsonAuthorizationRef: "authorization:daisy:production-proving:1",
  };
  const attestation = (kind, id, capabilityId, observedValue) => ({
    attestationSchemaVersion: 1,
    attestationId: id,
    kind,
    hostId: "host:shield-ops-feature-flight-run",
    toolExecutorId: binding.toolExecutorId,
    repositoryId: binding.repositoryId,
    canonicalWritableRoot: claimRoot,
    capabilityId,
    observedValue,
    observedAt: "2026-08-10T22:00:10.000Z",
    expiresAt: "2026-08-10T22:00:10.000Z",
  });
  return {
    state: "ready",
    context: {
      permissionContractVersion: 1,
      journalSchemaVersion: 9,
      missionId: binding.missionId,
      subjectId: binding.subjectId,
      missionRevisionId: binding.missionRevisionId,
      artifactRevisionId: head,
      evaluatedThroughSequence: 9,
      reasoningRuntimeId: binding.reasoningRuntimeId,
      toolExecutorId: binding.toolExecutorId,
      repositoryId: binding.repositoryId,
      canonicalWritableRoot: claimRoot,
      branch: binding.branch,
      requiredCapabilities: ["read_only_coordination"],
      activeBindings: [binding],
      attestations: [
        attestation("repository_root", "attestation:root", null, claimRoot),
        attestation("writability", "attestation:writable", null, true),
        attestation("capability", "attestation:read-only", "read_only_coordination", true),
      ],
      evaluatedAt: "2026-08-10T22:00:10.000Z",
      decisionId: "decision:cycle:production-proving:1",
    },
    daisyCoordination: {
      authorityRef: "authority:daisy:production-proving:1",
      authorityDigest: "a".repeat(64),
      authoritySequence: 8,
      approvedReadRoots,
      durableArtifactRoot: claimRoot,
      bindingId: binding.bindingId,
      bindingVersion: binding.bindingVersion,
      runtimeId: binding.reasoningRuntimeId,
      modelId: "model:daisy-production",
      executorId: binding.toolExecutorId,
    },
  };
}

async function fixture(t) {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "shield-feature-flight-run-")));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const claimRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-feature-flight-claims-")));
  t.after(() => rm(claimRoot, { recursive: true, force: true }));
  const worktree = join(parent, "external");
  const artifacts = join(parent, "artifacts");
  await mkdir(worktree);
  await mkdir(artifacts);
  await execFile("git", ["init", "-q", "-b", "agent/issue-251", worktree]);
  await git(worktree, ["config", "user.name", "Feature Flight"]);
  await git(worktree, ["config", "user.email", "flight@shield.invalid"]);
  await mkdir(join(worktree, ".shield"));
  await writeFile(join(worktree, ".shield/config.json"), `${JSON.stringify({
    schemaVersion: 1,
    repositoryId: "owner/repo",
    adapterId: "github",
    supportedSeatIds: ["hill", "daisy", "coulson"],
    supportedModeIds: ["delivery"],
    trustedHumanBindingRefs: [],
    paths: { journals: ".shield/journals", artifacts: ".shield/artifacts", reports: ".shield/reports", temp: ".shield/tmp" },
  }, null, 2)}\n`);
  await writeFile(join(worktree, "README.md"), "base\n");
  await git(worktree, ["add", "."]);
  await git(worktree, ["commit", "-q", "-m", "base"]);
  const base = await git(worktree, ["rev-parse", "HEAD"]);
  await writeFile(join(worktree, "README.md"), "head\n");
  await git(worktree, ["add", "README.md"]);
  await git(worktree, ["commit", "-q", "-m", "head"]);
  const head = await git(worktree, ["rev-parse", "HEAD"]);
  await git(worktree, ["remote", "add", "origin", "git@github.com:owner/repo.git"]);

  const plan = planValue(parent, worktree, base);
  const planPath = join(artifacts, "plan.json");
  const planBytes = canonicalFeatureFlightBytes(plan);
  await writeFile(planPath, planBytes);
  const planIdentity = { path: planPath, bytes: planBytes.length, sha256: hash(planBytes) };
  const predecessor = stateValue(plan, planIdentity, "authorized", 0, null, head);
  const predecessorPath = join(artifacts, "state-0.json");
  const predecessorBytes = canonicalFeatureFlightBytes(predecessor);
  await writeFile(predecessorPath, predecessorBytes);
  const state = stateValue(plan, planIdentity, "active", 1, hash(predecessorBytes), head);
  const statePath = join(artifacts, "state-1.json");
  const stateBytes = canonicalFeatureFlightBytes(state);
  await writeFile(statePath, stateBytes);

  const packagePath = join(artifacts, "package.tgz");
  const packageBytes = Buffer.from("package-artifact\n");
  await writeFile(packagePath, packageBytes);
  const fixtureIdentityBytes = await readFile(fixtureIdentityPath);
  const baselinePath = join(artifacts, "release-baseline.json");
  const baselineBytes = Buffer.from(JSON.stringify({
    kind: "fixture-release-baseline",
    schemaVersion: "shield.fixture.release-baseline.v1",
    identityRecordDigest: hash(fixtureIdentityBytes),
    verifierDigest: "1".repeat(64),
    launcherDigest: "2".repeat(64),
    verifierIdentity: `node:${process.version}`,
    launcherIdentity: `node:${process.execPath}`,
    package: { name: "@shield/team-system", version: "0.1.0", digestAlgorithm: "sha256", digest: hash(packageBytes) },
  }));
  await writeFile(baselinePath, baselineBytes);

  const adapterBytes = await readFile(adapterPath);
  const initialRunner = runnerInput("placeholder");
  const proving = deriveFeatureFlightProvingTupleV1({
    planDigest: hash(planBytes),
    flightId: plan.flightId,
    fixtureRoot,
    fixtureIdentityDigest: hash(fixtureIdentityBytes),
    adapterPath,
    adapterDigest: hash(adapterBytes),
    releaseBaselineDigest: hash(baselineBytes),
    packageDigest: hash(packageBytes),
    repository: "owner/repo",
    branch: "agent/issue-251",
    headRevision: head,
    mission: initialRunner.plan.missionId,
    subject: initialRunner.plan.subjectId,
    missionRevision: initialRunner.plan.revisionId,
    measurementIntentId: "measurement:production-proving:1",
    runnerIntent: intentFromRunner(initialRunner),
  });
  const runner = runnerInput(proving.effectKey);
  const runnerPath = join(artifacts, "runner.json");
  const runnerBytes = Buffer.from(canonicalJson(runner));
  await writeFile(runnerPath, runnerBytes);
  const manifestPath = join(artifacts, "manifest.json");
  const manifest = {
    contract: FEATURE_FLIGHT_RUN_MANIFEST_CONTRACT,
    version: FEATURE_FLIGHT_RUN_MANIFEST_VERSION,
    plan: { path: planPath, sha256: hash(planBytes) },
    state: { path: statePath, sha256: hash(stateBytes) },
    predecessor: { path: predecessorPath, sha256: hash(predecessorBytes) },
    runnerInput: { path: runnerPath, sha256: hash(runnerBytes) },
    releaseBaseline: { path: baselinePath, sha256: hash(baselineBytes) },
    packageArtifact: { path: packagePath, sha256: hash(packageBytes) },
    measurementIntentId: "measurement:production-proving:1",
    sequence: 1,
  };
  await writeFile(manifestPath, JSON.stringify(manifest));
  return { parent, worktree, artifacts, claimRoot, head, proving, runner, manifest, manifestPath };
}

function dependenciesFor(f, overrides = {}) {
  let permissionCalls = 0;
  let importCalls = 0;
  let launcherCalls = 0;
  let measurementCalls = 0;
  let time = 0;
  const dependencies = {
    now: () => `2026-08-10T22:00:${String(10 + time++).padStart(2, "0")}.000Z`,
    loadPermissionContext: async () => { permissionCalls += 1; return permissionResult({
      claimRoot: f.claimRoot,
      head: f.head,
      effectKey: f.proving.effectKey,
      approvedReadRoots: [f.artifacts, f.worktree, fixtureRoot],
    }); },
    importAdapter: async () => { importCalls += 1; return { createFeatureFlightAdapterV1 }; },
    launchExternalFixture: async () => { launcherCalls += 1; return { state: "ready" }; },
    persistMeasurement: async ({ projection, snapshot }) => {
      measurementCalls += 1;
      assert.equal(snapshot.headRevision, f.head);
      assert.equal(snapshot.runnerInput.sha256, hash(Buffer.from(canonicalJson(f.runner))));
      assert.equal(projection.durable, true);
      return { state: "created", path: join(f.claimRoot, "measurement.json") };
    },
    runStep: async (_input, trusted) => {
      assert.equal(_input.maxSteps, 1);
      assert.equal(importCalls, 0);
      assert.equal(launcherCalls, 0);
      const decision = await trusted.authorizeRunner(f.runner.plan);
      assert.equal(validateRunnerPermissionDecision(decision).state, "valid");
      assert.equal(decision.outcome, "allow");
      const executed = await trusted.invokeDaisyAdapter(f.runner.plan, decision, trusted.adapterDescriptor);
      assert.equal(executed.outcome, "completed");
      return {
        outcome: "completed",
        effectClaimId: "e".repeat(64),
        terminal: { attemptDigest: "d".repeat(64) },
        gateEligible: false,
      };
    },
    ...overrides,
  };
  return {
    dependencies,
    counts: () => ({ permission: permissionCalls, import: importCalls, launcher: launcherCalls, measurement: measurementCalls }),
  };
}

test("signed proving tuple is non-self-referential and binds every fixed intent substitution", async (t) => {
  const f = await fixture(t);
  assert.equal(f.runner.plan.effectKey, f.proving.effectKey);
  const changed = deriveFeatureFlightProvingTupleV1({
    planDigest: f.proving.tuple.plan.sha256,
    flightId: f.proving.tuple.plan.flightId,
    fixtureRoot: f.proving.tuple.fixture.root,
    fixtureIdentityDigest: f.proving.tuple.fixture.identitySha256,
    adapterPath: f.proving.tuple.adapter.path,
    adapterDigest: f.proving.tuple.adapter.sha256,
    releaseBaselineDigest: f.proving.tuple.releaseBaselineSha256,
    packageDigest: "0".repeat(64),
    repository: f.proving.tuple.repository,
    branch: f.proving.tuple.branch,
    headRevision: f.proving.tuple.headRevision,
    mission: f.proving.tuple.mission,
    subject: f.proving.tuple.subject,
    missionRevision: f.proving.tuple.missionRevision,
    measurementIntentId: f.proving.tuple.measurementIntentId,
    runnerIntent: f.proving.tuple.runnerIntent,
  });
  assert.notEqual(changed.effectKey, f.proving.effectKey);
  assert.equal(Object.hasOwn(f.proving.tuple.runnerIntent.plan, "effectKey"), false);
  assert.equal(JSON.stringify(f.proving.tuple).includes(hash(Buffer.from(canonicalJson(f.runner)))), false);
});

test("fresh production composition authorizes, claims through the step, imports and launches once, then measures once", async (t) => {
  const f = await fixture(t);
  const controlled = dependenciesFor(f);
  const result = await runFeatureFlightProductionV1({ manifestPath: f.manifestPath }, controlled.dependencies);
  assert.equal(result.state, "completed");
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.counts, { import: 1, launcher: 1, measurement: 1 });
  assert.deepEqual(controlled.counts(), { permission: 1, import: 1, launcher: 1, measurement: 1 });
});

test("real step store performs one fresh invocation and exact replay performs none", async (t) => {
  const f = await fixture(t);
  const controlled = dependenciesFor(f, {
    execFile: async (command, args, options = {}) => {
      if (command === "git" && args.includes("ls-remote")) {
        return `${f.head}\trefs/heads/agent/issue-251\n`;
      }
      const result = await execFile(command, args, {
        ...options,
        encoding: options.encoding ?? "utf8",
        env: { ...process.env, PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C" },
      });
      return result.stdout;
    },
  });
  delete controlled.dependencies.runStep;
  const first = await runFeatureFlightProductionV1({ manifestPath: f.manifestPath }, controlled.dependencies);
  assert.equal(first.projection.outcome, "completed");
  assert.deepEqual(first.counts, { import: 1, launcher: 1, measurement: 1 });
  const second = await runFeatureFlightProductionV1({ manifestPath: f.manifestPath }, controlled.dependencies);
  assert.equal(second.projection.outcome, "replayed");
  assert.deepEqual(second.counts, { import: 0, launcher: 0, measurement: 1 });
  assert.deepEqual(controlled.counts(), { permission: 2, import: 1, launcher: 1, measurement: 2 });
});

test("terminal replay measures without a second adapter import or launcher invocation", async (t) => {
  const f = await fixture(t);
  const controlled = dependenciesFor(f, {
    runStep: async () => ({
      outcome: "replayed",
      effectClaimId: "e".repeat(64),
      terminal: { attemptDigest: "d".repeat(64) },
      gateEligible: false,
    }),
    persistMeasurement: async ({ projection }) => {
      assert.equal(projection.outcome, "replayed");
      return { state: "replayed" };
    },
  });
  const result = await runFeatureFlightProductionV1({ manifestPath: f.manifestPath }, controlled.dependencies);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.counts, { import: 0, launcher: 0, measurement: 1 });
});

test("measurement failure preserves the durable step disposition and exits nonzero", async (t) => {
  const f = await fixture(t);
  const controlled = dependenciesFor(f, {
    persistMeasurement: async () => { throw new Error("measurement_write_uncertain"); },
  });
  const result = await runFeatureFlightProductionV1({ manifestPath: f.manifestPath }, controlled.dependencies);
  assert.equal(result.projection.outcome, "completed");
  assert.equal(result.measurement.state, "recovery_required");
  assert.match(result.measurement.reason, /measurement_write_uncertain/);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.counts, { import: 1, launcher: 1, measurement: 1 });
});

test("durable recovery is measured once while non-durable recovery has no measurement effect", async (t) => {
  const f = await fixture(t);
  for (const durable of [true, false]) {
    let measurements = 0;
    const controlled = dependenciesFor(f, {
      runStep: async () => ({
        outcome: "recovery_required",
        reason: durable ? "adapter_uncertain" : "store_unavailable",
        durable,
        effectClaimId: "e".repeat(64),
        ...(durable ? { recoveryReceipt: { attemptDigest: "d".repeat(64) } } : {}),
        gateEligible: false,
      }),
      persistMeasurement: async () => { measurements += 1; return { state: "created" }; },
    });
    const result = await runFeatureFlightProductionV1({ manifestPath: f.manifestPath }, controlled.dependencies);
    assert.equal(result.exitCode, 1);
    assert.equal(measurements, durable ? 1 : 0);
  }
});

test("authority substitution and symlink manifest reject before claim, import, launch, or measurement", async (t) => {
  const f = await fixture(t);
  let stepCalls = 0;
  let importCalls = 0;
  let launcherCalls = 0;
  let measurementCalls = 0;
  const base = dependenciesFor(f, {
    loadPermissionContext: async () => {
      const result = permissionResult({
        claimRoot: f.claimRoot,
        head: f.head,
        effectKey: f.proving.effectKey,
        approvedReadRoots: [f.artifacts, f.worktree, fixtureRoot],
      });
      result.context.activeBindings[0].approvedScope.effectKeys = ["0".repeat(64)];
      return result;
    },
    runStep: async () => { stepCalls += 1; },
    importAdapter: async () => { importCalls += 1; },
    launchExternalFixture: async () => { launcherCalls += 1; },
    persistMeasurement: async () => { measurementCalls += 1; },
  });
  await assert.rejects(runFeatureFlightProductionV1({ manifestPath: f.manifestPath }, base.dependencies), /does not exact-match/);
  assert.deepEqual({ stepCalls, importCalls, launcherCalls, measurementCalls }, { stepCalls: 0, importCalls: 0, launcherCalls: 0, measurementCalls: 0 });

  const symlinkPath = join(f.artifacts, "manifest-link.json");
  await symlink(f.manifestPath, symlinkPath);
  await assert.rejects(runFeatureFlightProductionV1({ manifestPath: symlinkPath }, base.dependencies), /safe non-alias regular file/);
  assert.equal(stepCalls, 0);
});

test("hard links, FIFOs, unsafe modes, unknown manifest fields, and byte drift fail before effects", async (t) => {
  const cases = [];
  {
    const f = await fixture(t);
    const hardLink = join(f.artifacts, "manifest-hardlink.json");
    await link(f.manifestPath, hardLink);
    cases.push({ f, path: hardLink, dependencies: dependenciesFor(f).dependencies, pattern: /safe non-alias regular file/ });
  }
  {
    const f = await fixture(t);
    const fifo = join(f.artifacts, "manifest.fifo");
    await execFile("mkfifo", [fifo]);
    cases.push({ f, path: fifo, dependencies: dependenciesFor(f).dependencies, pattern: /safe non-alias regular file/ });
  }
  {
    const f = await fixture(t);
    await chmod(f.manifestPath, 0o666);
    cases.push({ f, path: f.manifestPath, dependencies: dependenciesFor(f).dependencies, pattern: /safe non-alias regular file/ });
  }
  {
    const f = await fixture(t);
    await writeFile(f.manifestPath, JSON.stringify({ ...f.manifest, allow: true }));
    cases.push({ f, path: f.manifestPath, dependencies: dependenciesFor(f).dependencies, pattern: /unknown or non-data field/ });
  }
  {
    const f = await fixture(t);
    let drifted = false;
    const controlled = dependenciesFor(f, {
      beforeRead: async ({ path }) => {
        if (!drifted && path === f.manifestPath) {
          drifted = true;
          await writeFile(path, `${JSON.stringify(f.manifest)} `);
        }
      },
    });
    cases.push({ f, path: f.manifestPath, dependencies: controlled.dependencies, pattern: /identity changed during capture/ });
  }
  for (const fixtureCase of cases) {
    let stepCalls = 0;
    fixtureCase.dependencies.runStep = async () => { stepCalls += 1; };
    await assert.rejects(
      runFeatureFlightProductionV1({ manifestPath: fixtureCase.path }, fixtureCase.dependencies),
      fixtureCase.pattern,
    );
    assert.equal(stepCalls, 0);
  }
});

test("adapter import failure is entered only after the step callback and returns durable recovery without retry", async (t) => {
  const f = await fixture(t);
  let callbackCalls = 0;
  const controlled = dependenciesFor(f, {
    importAdapter: async () => { throw new Error("captured_adapter_import_failed"); },
    runStep: async (_input, trusted) => {
      const decision = await trusted.authorizeRunner(f.runner.plan);
      callbackCalls += 1;
      await assert.rejects(trusted.invokeDaisyAdapter(f.runner.plan, decision, trusted.adapterDescriptor), /captured_adapter_import_failed/);
      return {
        outcome: "recovery_required",
        reason: "adapter_uncertain",
        durable: true,
        effectClaimId: "e".repeat(64),
        recoveryReceipt: { attemptDigest: "d".repeat(64) },
        gateEligible: false,
      };
    },
  });
  const result = await runFeatureFlightProductionV1({ manifestPath: f.manifestPath }, controlled.dependencies);
  assert.equal(result.exitCode, 1);
  assert.equal(callbackCalls, 1);
  assert.deepEqual(result.counts, { import: 1, launcher: 0, measurement: 1 });
});

test("real post-claim import failure becomes durable recovery and replay never imports again", async (t) => {
  const f = await fixture(t);
  let imports = 0;
  const controlled = dependenciesFor(f, {
    importAdapter: async () => { imports += 1; throw new Error("captured_adapter_import_failed"); },
    execFile: async (command, args, options = {}) => {
      if (command === "git" && args.includes("ls-remote")) return `${f.head}\trefs/heads/agent/issue-251\n`;
      const result = await execFile(command, args, {
        ...options,
        encoding: options.encoding ?? "utf8",
        env: { ...process.env, PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C" },
      });
      return result.stdout;
    },
  });
  delete controlled.dependencies.runStep;
  const first = await runFeatureFlightProductionV1({ manifestPath: f.manifestPath }, controlled.dependencies);
  assert.equal(first.projection.outcome, "recovery_required");
  assert.equal(first.projection.durable, true);
  assert.equal(imports, 1);
  const second = await runFeatureFlightProductionV1({ manifestPath: f.manifestPath }, controlled.dependencies);
  assert.equal(second.projection.outcome, "recovery_required");
  assert.equal(second.projection.durable, true);
  assert.equal(imports, 1);
  assert.equal(second.counts.import, 0);
  assert.equal(second.counts.launcher, 0);
});

test("concurrent real contenders have aggregate launcher count at most one", async (t) => {
  const f = await fixture(t);
  let launches = 0;
  const controlled = dependenciesFor(f, {
    launchExternalFixture: async () => {
      launches += 1;
      await new Promise((done) => setTimeout(done, 20));
      return { state: "ready" };
    },
    execFile: async (command, args, options = {}) => {
      if (command === "git" && args.includes("ls-remote")) return `${f.head}\trefs/heads/agent/issue-251\n`;
      const result = await execFile(command, args, {
        ...options,
        encoding: options.encoding ?? "utf8",
        env: { ...process.env, PATH: process.env.PATH ?? "", LANG: "C", LC_ALL: "C" },
      });
      return result.stdout;
    },
  });
  delete controlled.dependencies.runStep;
  const results = await Promise.all([
    runFeatureFlightProductionV1({ manifestPath: f.manifestPath }, controlled.dependencies),
    runFeatureFlightProductionV1({ manifestPath: f.manifestPath }, controlled.dependencies),
  ]);
  assert.ok(results.every(({ projection }) => ["completed", "replayed", "recovery_required"].includes(projection.outcome)));
  assert.ok(launches <= 1);
  assert.ok(results.reduce((total, result) => total + result.counts.launcher, 0) <= 1);
});

test("argument parser and spawned real CLI reject malformed input before adapter pathname loading", async (t) => {
  assert.deepEqual(parseFeatureFlightRunArguments(["--help"]), { help: true });
  assert.throws(() => parseFeatureFlightRunArguments([]), /Usage/);
  const directory = await mkdtemp(join(tmpdir(), "shield-feature-flight-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifestPath = join(directory, "manifest.json");
  const loaderLog = join(directory, "loader.jsonl");
  await writeFile(manifestPath, JSON.stringify({ contract: "substituted" }));
  await writeFile(loaderLog, "");
  await chmod(loaderLog, 0o600);
  const result = spawnSync(process.execPath, ["--loader", loader, cli, "flight", "run", "--input", manifestPath], {
    cwd: testRoot,
    encoding: "utf8",
    env: { ...process.env, SHIELD_FEATURE_FLIGHT_LOADER_LOG: loaderLog },
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /rejected before effects/u);
  const events = (await readFile(loaderLog, "utf8")).trim().split("\n").filter(Boolean).map(JSON.parse);
  assert.equal(events.some(({ adapterPathname }) => adapterPathname === true), false);
  assert.equal(events.some(({ followedFromCapturedAdapter }) => followedFromCapturedAdapter === true), false);
});
