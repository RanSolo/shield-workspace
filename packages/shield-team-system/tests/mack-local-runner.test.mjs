import assert from "node:assert/strict";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test, { after } from "node:test";

import { canonicalJson } from "../dist/mission-v2.mjs";
import { normalizeMackLocalValidationRequestV1 } from "../dist/mack-local-validation-v1.mjs";
import {
  readMackProductionValidationRegistryV1,
  reconstructMackSyntheticEvidenceV1,
  runMackLocalValidation,
} from "../scripts/model/mack-validation-runner.mjs";

const execFile = promisify(execFileCallback);
const runnerPath = fileURLToPath(new URL("../scripts/model/mack-validation-runner.mjs", import.meta.url));
const emptyDigest = "sha256:47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";
let requestCounter = 0;
const replayParent = await realpath(await mkdtemp(join(tmpdir(), "shield-mack-replay-tests-")));
const replayRegistryRoot = join(replayParent, "registry");
const fixtureRepositoryRoot = join(replayParent, "repository");
await mkdir(join(fixtureRepositoryRoot, ".git"), { recursive: true, mode: 0o700 });
after(() => rm(replayParent, { recursive: true, force: true }));

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("base64url")}`;
}

function frozenBytes(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return { contentBase64: bytes.toString("base64"), sha256: digest(bytes), truncated: false };
}

function requestFixture(overrides = {}) {
  requestCounter += 1;
  const root = fixtureRepositoryRoot;
  return {
    schemaVersion: 1,
    contractVersion: "mack.local-validation.v1",
    seatId: "mack",
    missionId: "mission:issue-196",
    missionRevisionId: `sha256:${"A".repeat(43)}`,
    subjectId: "github:RanSolo/shield-workspace/issue/196",
    repository: "RanSolo/shield-workspace",
    repositoryRoot: root,
    canonicalGitDirectory: `${root}/.git`,
    branch: "agent/issue-196",
    baseRevisionId: "1".repeat(40),
    artifactRevisionId: "2".repeat(40),
    validationRequestId: `validation:runner:${requestCounter}`,
    model: { provider: "lmstudio", baseUrl: "http://127.0.0.1:1234", modelKey: "google/gemma-4-31b-qat" },
    toolExecutorId: "executor:local-mack-validation-v1",
    scenarios: [{ scenarioId: "focused", required: true, description: "Focused behavior passes." }],
    lanes: [{
      laneId: "focused",
      commandId: "test:focused",
      executable: "/usr/bin/node",
      executableSha256: `sha256:${"B".repeat(43)}`,
      argv: ["--test", "focused.test.mjs"],
      workingDirectory: root,
      timeoutMs: 30_000,
      environment: [{ name: "LANG", value: "C" }, { name: "LC_ALL", value: "C" }],
      required: true,
      scenarioIds: ["focused"],
    }],
    approvedTestSurfaces: [],
    repositoryContext: {
      implementationPaths: ["src/feature.mjs"],
      diff: frozenBytes("diff\n"),
      sources: [{ path: "src/feature.mjs", ...frozenBytes("export const feature = true;\n") }],
    },
    missionArtifacts: [{ artifactId: "artifact:plan", path: "docs/plan.md", ...frozenBytes("approved\n") }],
    ...overrides,
  };
}

function registry(request) {
  return request.lanes.map(({ commandId, executable, executableSha256, argv, workingDirectory, timeoutMs, environment }) => ({ commandId, executable, executableSha256, argv: [...argv], workingDirectory, timeoutMs, environment: environment.map((entry) => ({ ...entry })) }));
}

function runnerOptions(request, overrides = {}) {
  return { commandRegistry: registry(request), replayRegistryRoot, ...overrides };
}

function replayPath(root, request, suffix) {
  const key = createHash("sha256").update(request.validationRequestId, "utf8").digest("hex");
  return join(root, `${key}.${suffix}`);
}

async function runRunnerCli(request, options) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, [runnerPath], {
      cwd: request.repositoryRoot,
      env: {
        ...process.env,
        SHIELD_MACK_COMMAND_REGISTRY_JSON: JSON.stringify(options.commandRegistry),
        SHIELD_MACK_REPLAY_REGISTRY_ROOT: options.replayRegistryRoot,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.once("error", rejectRun);
    child.once("close", (code, signal) => {
      const output = Buffer.concat(stdout).toString("utf8");
      const errors = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) rejectRun(new Error(`mack_cli_failed:${code}:${signal ?? "none"}:${errors.trim()}`));
      else resolveRun(JSON.parse(output));
    });
    child.stdin.end(JSON.stringify(request));
  });
}

function runtime(instance = "gemma-instance") {
  return { provider: "lmstudio", origin: "http://127.0.0.1:1234", observedModelKey: "google/gemma-4-31b-qat", loadedInstanceId: instance };
}

function observation(request, overrides = {}) {
  return {
    repository: request.repository,
    canonicalRepositoryRoot: request.repositoryRoot,
    canonicalTopLevel: request.repositoryRoot,
    canonicalGitDirectory: `${request.repositoryRoot}/.git`,
    branch: request.branch,
    headRevisionId: request.artifactRevisionId,
    statusPorcelainBytes: 0,
    statusPorcelainSha256: emptyDigest,
    changedPaths: [...request.repositoryContext.implementationPaths],
    ...overrides,
  };
}

function receipt(request, overrides = {}) {
  const lane = request.lanes[0];
  return {
    laneId: lane.laneId,
    commandId: lane.commandId,
    executable: lane.executable,
    executableSha256: lane.executableSha256,
    argv: [...lane.argv],
    workingDirectory: lane.workingDirectory,
    environment: lane.environment.map((entry) => ({ ...entry })),
    startedAt: "2026-08-05T12:00:00.000Z",
    endedAt: "2026-08-05T12:00:01.000Z",
    exitCode: 0,
    signal: null,
    timedOut: false,
    launchError: null,
    stdout: { sha256: emptyDigest, bytes: 0, truncated: false },
    stderr: { sha256: emptyDigest, bytes: 0, truncated: false },
    ...overrides,
  };
}

function candidate(request, overrides = {}) {
  return {
    scenarioAssessments: request.scenarios.map(({ scenarioId }) => ({ scenarioId, assessment: "satisfied", summary: "The supplied host evidence supports the scenario." })),
    findings: [],
    limitations: [],
    recommendedRoute: "advance",
    ...overrides,
  };
}

function dependencies(request, overrides = {}) {
  let probeCount = 0;
  let observationCount = 0;
  return {
    canonicalPath: async (path) => path,
    hashExecutable: async () => request.lanes[0].executableSha256,
    probeModel: async () => { probeCount += 1; return runtime(); },
    observeRepository: async () => { observationCount += 1; return observation(request); },
    deriveRepositoryContext: async () => structuredClone(request.repositoryContext),
    executeCommand: async () => receipt(request),
    inferModel: async () => {
      const content = JSON.stringify(candidate(request));
      return { responseBytes: Buffer.from(JSON.stringify({ output: [{ type: "message", content }] })), content, providerCounters: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
    },
    fetchImpl: async () => { throw new Error("fetch_not_expected"); },
    getCounts: () => ({ probeCount, observationCount }),
    ...overrides,
  };
}

function injectedWithoutCounters(deps) {
  const { getCounts, ...allowed } = deps;
  return { allowed, getCounts };
}

test("runner keeps the model narrow and constructs synthetic, ineligible evidence from host receipts", async () => {
  const request = requestFixture();
  let inferenceInput;
  const deps = dependencies(request, {
    inferModel: async (input) => {
      inferenceInput = input;
      const content = JSON.stringify(candidate(request));
      return { responseBytes: Buffer.from(content), content, providerCounters: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } };
    },
  });
  const { allowed, getCounts } = injectedWithoutCounters(deps);
  const evidence = await runMackLocalValidation(request, runnerOptions(request), allowed);
  assert.equal(evidence.report.status, "pass");
  assert.equal(evidence.evidenceSource, "synthetic");
  assert.equal(evidence.advancementEligibility, "ineligible");
  assert.equal(evidence.reasoningRuntimeId, "gemma-instance");
  assert.equal(evidence.toolExecutorId, "executor:local-mack-validation-v1");
  assert.deepEqual(getCounts(), { probeCount: 2, observationCount: 2 });
  assert.equal(inferenceInput.runtime.loadedInstanceId, "gemma-instance");
  assert.equal(inferenceInput.prompt.includes(request.lanes[0].argv[0]), false);
  assert.match(inferenceInput.systemPrompt, /host alone owns identities, command outcomes, coverage, final status, routing/i);
  const normalized = normalizeMackLocalValidationRequestV1(request);
  assert.equal(normalized.state, "valid");
  assert.deepEqual(reconstructMackSyntheticEvidenceV1(request, normalized.requestDigest, evidence), evidence);
});

test("protected production readback is pinned to one request ID and digest and rejects synthetic registry evidence", async (t) => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "shield-mack-readback-")));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, "registry");
  const request = requestFixture();
  const deps = dependencies(request);
  const { allowed } = injectedWithoutCounters(deps);
  await runMackLocalValidation(request, runnerOptions(request, { replayRegistryRoot: root }), allowed);
  const normalized = normalizeMackLocalValidationRequestV1(request);
  assert.equal(normalized.state, "valid");
  const binding = { replayRegistryRoot: root, validationRequestId: request.validationRequestId, requestDigest: normalized.requestDigest };
  assert.deepEqual(await readMackProductionValidationRegistryV1(request, binding), {
    state: "invalid",
    reasonCode: "mack_production_evidence_invalid",
  });
  assert.equal((await readMackProductionValidationRegistryV1(request, { ...binding, requestDigest: `sha256:${"Z".repeat(43)}` })).state, "invalid");
  const absent = structuredClone(request);
  absent.validationRequestId = `${request.validationRequestId}:absent`;
  const absentNormalized = normalizeMackLocalValidationRequestV1(absent);
  assert.equal(absentNormalized.state, "valid");
  assert.equal((await readMackProductionValidationRegistryV1(absent, {
    replayRegistryRoot: root,
    validationRequestId: absent.validationRequestId,
    requestDigest: absentNormalized.requestDigest,
  })).state, "waiting");
});

test("protected production readback retains registry-root identity across replacement", async (t) => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "shield-mack-root-retention-")));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const root = join(parent, "registry");
  const alternate = join(parent, "alternate");
  const holding = join(parent, "holding");
  await Promise.all([mkdir(root, { mode: 0o700 }), mkdir(alternate, { mode: 0o700 })]);
  const request = requestFixture();
  const normalized = normalizeMackLocalValidationRequestV1(request);
  assert.equal(normalized.state, "valid");
  const binding = { replayRegistryRoot: root, validationRequestId: request.validationRequestId, requestDigest: normalized.requestDigest };
  let stop = false;
  let swaps = 0;
  const swapper = (async () => {
    while (!stop && swaps < 10_000) {
      await rename(root, holding);
      await rename(alternate, root);
      await rename(holding, alternate);
      swaps += 1;
      await new Promise((resolveTurn) => setImmediate(resolveTurn));
    }
  })();
  let recovery = false;
  for (let attempt = 0; attempt < 200 && !recovery; attempt += 1) {
    recovery = (await readMackProductionValidationRegistryV1(request, binding)).state === "recovery";
  }
  stop = true;
  await swapper;
  assert.ok(swaps > 0);
  assert.equal(recovery, true);
});

test("nonzero, signal, timeout, launch failure, and truncation receipts cannot become eligible", async () => {
  const cases = [
    { exitCode: 1 },
    { exitCode: null, signal: "SIGTERM" },
    { exitCode: null, timedOut: true },
    { exitCode: null, launchError: "enoent" },
    { stdout: { sha256: emptyDigest, bytes: 0, truncated: true } },
  ];
  for (const receiptOverrides of cases) {
    const request = requestFixture();
    const deps = dependencies(request, { executeCommand: async () => receipt(request, receiptOverrides) });
    const { allowed } = injectedWithoutCounters(deps);
    const evidence = await runMackLocalValidation(request, runnerOptions(request), allowed);
    assert.notEqual(evidence.report.lanes[0].outcome, "pass");
    assert.equal(evidence.advancementEligibility, "ineligible");
  }
});

test("command registry substitution and command-definition drift are rejected before execution", async () => {
  const request = requestFixture();
  const substitutions = [
    (value) => { value[0].commandId = "test:other"; },
    (value) => { value[0].executable = "/bin/sh"; },
    (value) => { value[0].argv = ["-c", "echo substituted"]; },
    (value) => { value[0].workingDirectory = "/tmp"; },
    (value) => { value[0].timeoutMs += 1; },
    (value) => { value[0].environment[0].value = "other"; },
  ];
  for (const mutate of substitutions) {
    const changed = registry(request);
    mutate(changed);
    await assert.rejects(() => runMackLocalValidation(request, runnerOptions(request, { commandRegistry: changed }), { canonicalPath: async () => { throw new Error("host_access_must_not_run"); } }), /mack_command_registry_mismatch/u);
  }
});

test("stale HEAD, branch/root drift, dirty status, changed paths, and context substitution fail closed", async () => {
  const cases = [
    { headRevisionId: "3".repeat(40) },
    { branch: "other" },
    { canonicalTopLevel: "/tmp/other" },
    { statusPorcelainBytes: 2, statusPorcelainSha256: `sha256:${"E".repeat(43)}` },
    { changedPaths: ["src/other.mjs"] },
  ];
  for (const observationOverrides of cases) {
    const request = requestFixture();
    const deps = dependencies(request, { observeRepository: async () => observation(request, observationOverrides) });
    const { allowed } = injectedWithoutCounters(deps);
    await assert.rejects(() => runMackLocalValidation(request, runnerOptions(request), allowed), /mack_git_identity_mismatch/u);
  }
  const request = requestFixture();
  const substituted = structuredClone(request.repositoryContext);
  substituted.diff = frozenBytes("different revision\n");
  const deps = dependencies(request, { deriveRepositoryContext: async () => substituted });
  const { allowed } = injectedWithoutCounters(deps);
  await assert.rejects(() => runMackLocalValidation(request, runnerOptions(request), allowed), /mack_repository_context_mismatch/u);
});

test("pre/post runtime and Git identity must remain exactly equal", async () => {
  const requestRuntime = requestFixture();
  let runtimeProbe = 0;
  const runtimeDeps = dependencies(requestRuntime, { probeModel: async () => runtime(++runtimeProbe === 1 ? "instance-a" : "instance-b") });
  await assert.rejects(() => runMackLocalValidation(requestRuntime, runnerOptions(requestRuntime), injectedWithoutCounters(runtimeDeps).allowed), /mack_runtime_identity_changed/u);

  const requestGit = requestFixture();
  let gitProbe = 0;
  const gitDeps = dependencies(requestGit, { observeRepository: async () => observation(requestGit, ++gitProbe === 1 ? {} : { canonicalGitDirectory: `${requestGit.repositoryRoot}/other.git` }) });
  await assert.rejects(() => runMackLocalValidation(requestGit, runnerOptions(requestGit), injectedWithoutCounters(gitDeps).allowed), /mack_git_identity_mismatch/u);
});

test("malformed JSON, duplicate keys, unknown fields, and model-supplied PASS are rejected", async () => {
  const contents = [
    "not json",
    '{"scenarioAssessments":[],"scenarioAssessments":[],"findings":[],"limitations":[],"recommendedRoute":"advance"}',
    JSON.stringify({ ...candidate(requestFixture()), unknown: true }),
    JSON.stringify({ ...candidate(requestFixture()), status: "pass" }),
  ];
  for (const content of contents) {
    const request = requestFixture();
    const deps = dependencies(request, { inferModel: async () => ({ responseBytes: Buffer.from(content), content, providerCounters: { inputTokens: null, outputTokens: null, totalTokens: null } }) });
    await assert.rejects(() => runMackLocalValidation(request, runnerOptions(request), injectedWithoutCounters(deps).allowed), /mack_model_analysis_malformed|mack_evidence_invalid_model_analysis_invalid/u);
  }
});

test("identical request replay is idempotent and a conflicting same-ID request is rejected", async () => {
  const request = requestFixture();
  const deps = dependencies(request);
  const { allowed } = injectedWithoutCounters(deps);
  const first = await runMackLocalValidation(request, runnerOptions(request), allowed);
  const freshRunner = await import(`../scripts/model/mack-validation-runner.mjs?fresh=${Date.now()}`);
  const second = await freshRunner.runMackLocalValidation(structuredClone(request), runnerOptions(request), { canonicalPath: async () => { throw new Error("replay_must_not_touch_host"); } });
  assert.deepEqual(second, first);
  assert.equal(second.evidenceDigest, first.evidenceDigest);
  const recordRaw = await readFile(replayPath(replayRegistryRoot, request, "json"), "utf8");
  assert.equal(recordRaw, `${canonicalJson(JSON.parse(recordRaw))}\n`);
  assert.equal(JSON.parse(recordRaw).validationRequestId, request.validationRequestId);
  assert.equal(JSON.parse(recordRaw).requestDigest, first.requestDigest);
  assert.equal(JSON.parse(recordRaw).evidenceDigest, first.evidenceDigest);
  const rootStatus = await lstat(replayRegistryRoot);
  assert.equal(rootStatus.isDirectory(), true);
  if (process.platform !== "win32") assert.equal(rootStatus.mode & 0o077, 0);
  assert.deepEqual((await readdir(replayRegistryRoot)).filter((name) => name.includes(createHash("sha256").update(request.validationRequestId).digest("hex"))), [basename(replayPath(replayRegistryRoot, request, "json"))]);
  const conflict = structuredClone(request);
  conflict.missionArtifacts[0] = { ...conflict.missionArtifacts[0], ...frozenBytes("conflicting\n") };
  await assert.rejects(() => freshRunner.runMackLocalValidation(conflict, runnerOptions(conflict), { canonicalPath: async () => { throw new Error("conflict_must_not_touch_host"); } }), /mack_validation_replay_conflict/u);
});

test("atomic external lock excludes a fresh module before duplicated host effects", async () => {
  const request = requestFixture();
  let releaseFirst;
  let markStarted;
  const started = new Promise((resolveStarted) => { markStarted = resolveStarted; });
  const gate = new Promise((resolveGate) => { releaseFirst = resolveGate; });
  const firstDeps = dependencies(request, {
    canonicalPath: async (path) => { markStarted(); await gate; return path; },
  });
  const first = runMackLocalValidation(request, runnerOptions(request), injectedWithoutCounters(firstDeps).allowed);
  await started;
  const freshRunner = await import(`../scripts/model/mack-validation-runner.mjs?lock=${Date.now()}`);
  await assert.rejects(
    () => freshRunner.runMackLocalValidation(request, runnerOptions(request), { canonicalPath: async () => { throw new Error("duplicate_host_effect"); } }),
    /mack_validation_replay_in_progress/u,
  );
  releaseFirst();
  const evidence = await first;
  assert.equal(evidence.evidenceSource, "synthetic");
});

test("importers cannot enter the production CLI path by replacing process argv", async () => {
  const originalArgv1 = process.argv[1];
  const originalRegistry = process.env.SHIELD_MACK_COMMAND_REGISTRY_JSON;
  const originalReplayRoot = process.env.SHIELD_MACK_REPLAY_REGISTRY_ROOT;
  process.argv[1] = runnerPath;
  delete process.env.SHIELD_MACK_COMMAND_REGISTRY_JSON;
  delete process.env.SHIELD_MACK_REPLAY_REGISTRY_ROOT;
  try {
    const imported = await import(`../scripts/model/mack-validation-runner.mjs?argv-forgery=${Date.now()}`);
    assert.equal(typeof imported.runMackLocalValidation, "function");
    await new Promise((resolveTurn) => setImmediate(resolveTurn));
    assert.equal(process.exitCode, undefined);
  } finally {
    process.argv[1] = originalArgv1;
    if (originalRegistry === undefined) delete process.env.SHIELD_MACK_COMMAND_REGISTRY_JSON;
    else process.env.SHIELD_MACK_COMMAND_REGISTRY_JSON = originalRegistry;
    if (originalReplayRoot === undefined) delete process.env.SHIELD_MACK_REPLAY_REGISTRY_ROOT;
    else process.env.SHIELD_MACK_REPLAY_REGISTRY_ROOT = originalReplayRoot;
  }
});

test("external replay registry rejects confined, symlinked, nonregular, locked, and malformed state before host effects", async (t) => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "shield-mack-replay-safety-")));
  t.after(() => rm(parent, { recursive: true, force: true }));
  let hostCalls = 0;
  const noHostEffects = { canonicalPath: async () => { hostCalls += 1; throw new Error("host_effect_must_not_run"); } };

  const target = join(parent, "target");
  await mkdir(join(target, ".git"), { recursive: true, mode: 0o700 });
  const linkedRoot = join(parent, "linked-registry");
  await symlink(target, linkedRoot);
  const linkedRequest = requestFixture();
  await assert.rejects(() => runMackLocalValidation(linkedRequest, runnerOptions(linkedRequest, { replayRegistryRoot: linkedRoot }), noHostEffects), /mack_replay_registry_root_unsafe/u);

  const fileRoot = join(parent, "file-registry");
  await writeFile(fileRoot, "not a directory\n", { mode: 0o600 });
  const fileRequest = requestFixture();
  await assert.rejects(() => runMackLocalValidation(fileRequest, runnerOptions(fileRequest, { replayRegistryRoot: fileRoot }), noHostEffects), /mack_replay_registry_root_unsafe/u);

  const confinedRequest = requestFixture({ repositoryRoot: target, canonicalGitDirectory: join(target, ".git"), lanes: requestFixture().lanes.map((lane) => ({ ...lane, workingDirectory: target })) });
  await assert.rejects(() => runMackLocalValidation(confinedRequest, runnerOptions(confinedRequest, { replayRegistryRoot: join(target, "registry") }), noHostEffects), /mack_replay_registry_root_invalid/u);

  const unsafeRoot = join(parent, "unsafe-records");
  await mkdir(unsafeRoot, { mode: 0o700 });
  const malformedRequest = requestFixture();
  await writeFile(replayPath(unsafeRoot, malformedRequest, "json"), "{}", { mode: 0o600 });
  await assert.rejects(() => runMackLocalValidation(malformedRequest, runnerOptions(malformedRequest, { replayRegistryRoot: unsafeRoot }), noHostEffects), /mack_replay_registry_record_malformed/u);

  const symlinkRequest = requestFixture();
  const outsideRecord = join(parent, "outside-record");
  await writeFile(outsideRecord, "{}\n", { mode: 0o600 });
  await symlink(outsideRecord, replayPath(unsafeRoot, symlinkRequest, "json"));
  await assert.rejects(() => runMackLocalValidation(symlinkRequest, runnerOptions(symlinkRequest, { replayRegistryRoot: unsafeRoot }), noHostEffects), /mack_replay_registry_record_unsafe/u);

  const directoryRequest = requestFixture();
  await mkdir(replayPath(unsafeRoot, directoryRequest, "json"));
  await assert.rejects(() => runMackLocalValidation(directoryRequest, runnerOptions(directoryRequest, { replayRegistryRoot: unsafeRoot }), noHostEffects), /mack_replay_registry_record_unsafe/u);

  const lockedRequest = requestFixture();
  await writeFile(replayPath(unsafeRoot, lockedRequest, "lock"), "held\n", { mode: 0o600 });
  await assert.rejects(() => runMackLocalValidation(lockedRequest, runnerOptions(lockedRequest, { replayRegistryRoot: unsafeRoot }), noHostEffects), /mack_validation_replay_in_progress/u);

  const symlinkLockRequest = requestFixture();
  await symlink(outsideRecord, replayPath(unsafeRoot, symlinkLockRequest, "lock"));
  await assert.rejects(() => runMackLocalValidation(symlinkLockRequest, runnerOptions(symlinkLockRequest, { replayRegistryRoot: unsafeRoot }), noHostEffects), /mack_replay_registry_lock_unsafe/u);

  const orphanRequest = requestFixture();
  const orphanRecord = replayPath(unsafeRoot, orphanRequest, "json");
  await writeFile(join(unsafeRoot, `.${basename(orphanRecord)}.partial.tmp`), "partial", { mode: 0o600 });
  await assert.rejects(() => runMackLocalValidation(orphanRequest, runnerOptions(orphanRequest, { replayRegistryRoot: unsafeRoot }), noHostEffects), /mack_replay_registry_recovery_required/u);
  assert.equal(hostCalls, 0);
});

test("linked-worktree Git directories and foreign ownership reject replay before artifacts or host effects", async (t) => {
  const parent = await realpath(await mkdtemp(join(tmpdir(), "shield-mack-linked-worktree-")));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const linkedWorktreeRoot = join(parent, "worktree");
  const linkedGitDirectory = join(parent, "main.git", "worktrees", "fixture");
  await mkdir(linkedWorktreeRoot, { recursive: true, mode: 0o700 });
  await mkdir(linkedGitDirectory, { recursive: true, mode: 0o700 });
  const linkedRequest = requestFixture({
    repositoryRoot: linkedWorktreeRoot,
    canonicalGitDirectory: linkedGitDirectory,
    lanes: requestFixture().lanes.map((lane) => ({ ...lane, workingDirectory: linkedWorktreeRoot })),
  });
  const gitConfinedReplayRoot = join(linkedGitDirectory, "replay");
  let hostCalls = 0;
  const noHostEffects = { canonicalPath: async () => { hostCalls += 1; throw new Error("host_effect_must_not_run"); } };
  await assert.rejects(
    () => runMackLocalValidation(linkedRequest, runnerOptions(linkedRequest, { replayRegistryRoot: gitConfinedReplayRoot }), noHostEffects),
    /mack_replay_registry_root_invalid/u,
  );
  await assert.rejects(() => lstat(gitConfinedReplayRoot), { code: "ENOENT" });

  if (typeof process.geteuid === "function" && process.platform !== "win32") {
    const foreignOwnedDirectory = await realpath("/tmp");
    const foreignStatus = await lstat(foreignOwnedDirectory);
    if (foreignStatus.uid !== process.geteuid()) {
      const foreignGitRequest = requestFixture({ canonicalGitDirectory: foreignOwnedDirectory });
      const foreignReplayRoot = join(parent, "foreign-git-replay");
      await assert.rejects(
        () => runMackLocalValidation(foreignGitRequest, runnerOptions(foreignGitRequest, { replayRegistryRoot: foreignReplayRoot }), noHostEffects),
        /mack_replay_registry_root_invalid/u,
      );
      await assert.rejects(() => lstat(foreignReplayRoot), { code: "ENOENT" });

      const foreignRepositoryRequest = requestFixture({ repositoryRoot: foreignOwnedDirectory });
      const foreignRepositoryReplayRoot = join(parent, "foreign-repository-replay");
      await assert.rejects(
        () => runMackLocalValidation(foreignRepositoryRequest, runnerOptions(foreignRepositoryRequest, { replayRegistryRoot: foreignRepositoryReplayRoot }), noHostEffects),
        /mack_replay_registry_root_invalid/u,
      );
      await assert.rejects(() => lstat(foreignRepositoryReplayRoot), { code: "ENOENT" });
    } else {
      t.diagnostic("No foreign-owned canonical directory is available on this host; ownership enforcement remains platform-conditional.");
    }
  }
  assert.equal(hostCalls, 0);
});

test("real Git objects, no-shell command execution, and native no-tool inference compose end to end", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "shield-mack-runner-real-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await execFile("git", ["init", "-q", directory]);
  await execFile("git", ["-C", directory, "config", "user.email", "mack@example.test"]);
  await execFile("git", ["-C", directory, "config", "user.name", "Mack Fixture"]);
  await execFile("git", ["-C", directory, "remote", "add", "origin", "git@github.com:RanSolo/shield-workspace.git"]);
  await execFile("git", ["-C", directory, "checkout", "-q", "-b", "agent/issue-196"]);
  await writeFile(join(directory, "feature.mjs"), "export const value = 1;\n");
  await execFile("git", ["-C", directory, "add", "feature.mjs"]);
  await execFile("git", ["-C", directory, "commit", "-q", "-m", "base"]);
  const { stdout: baseStdout } = await execFile("git", ["-C", directory, "rev-parse", "HEAD"], { encoding: "utf8" });
  await writeFile(join(directory, "feature.mjs"), "export const value = 2;\n");
  await execFile("git", ["-C", directory, "add", "feature.mjs"]);
  await execFile("git", ["-C", directory, "commit", "-q", "-m", "artifact"]);
  const { stdout: artifactStdout } = await execFile("git", ["-C", directory, "rev-parse", "HEAD"], { encoding: "utf8" });
  const root = await realpath(directory);
  const { stdout: gitDirectoryStdout } = await execFile("git", ["-C", root, "rev-parse", "--absolute-git-dir"], { encoding: "utf8" });
  const canonicalGitDirectory = await realpath(gitDirectoryStdout.trim());
  const executable = await realpath(process.execPath);
  const executableBytes = await import("node:fs/promises").then(({ readFile }) => readFile(executable));
  const baseRevisionId = baseStdout.trim();
  const artifactRevisionId = artifactStdout.trim();
  const { stdout: diffStdout } = await execFile("git", ["-C", root, "diff", "--binary", "--no-ext-diff", "--full-index", baseRevisionId, artifactRevisionId, "--"], { encoding: "buffer", maxBuffer: 8_388_608 });
  const { stdout: sourceStdout } = await execFile("git", ["-C", root, "show", `${artifactRevisionId}:feature.mjs`], { encoding: "buffer", maxBuffer: 8_388_608 });
  const request = requestFixture({
    repositoryRoot: root,
    canonicalGitDirectory,
    branch: "agent/issue-196",
    baseRevisionId,
    artifactRevisionId,
    scenarios: [{ scenarioId: "real-host", required: true, description: "Real host evidence is collected." }],
    lanes: [{
      laneId: "real-host",
      commandId: "test:real-host",
      executable,
      executableSha256: digest(executableBytes),
      argv: ["-e", "process.stdout.write('ok\\n')"],
      workingDirectory: root,
      timeoutMs: 10_000,
      environment: [{ name: "LANG", value: "C" }, { name: "LC_ALL", value: "C" }],
      required: true,
      scenarioIds: ["real-host"],
    }],
    repositoryContext: {
      implementationPaths: ["feature.mjs"],
      diff: frozenBytes(diffStdout),
      sources: [{ path: "feature.mjs", ...frozenBytes(sourceStdout) }],
    },
  });
  const requests = [];
  const metadata = { models: [{ key: request.model.modelKey, loaded_instances: [{ id: "gemma-real-instance" }] }] };
  const content = JSON.stringify(candidate(request));
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith("/api/v1/models")) return new Response(JSON.stringify(metadata), { status: 200 });
    return new Response(JSON.stringify({ output: [{ type: "message", content }], stats: { input_tokens: 20, output_tokens: 8, total_tokens: 28 } }), { status: 200 });
  };
  const evidence = await runMackLocalValidation(request, runnerOptions(request), { fetchImpl });
  assert.equal(evidence.report.status, "pass");
  assert.equal(evidence.commandReceipts[0].stdout.bytes, 3);
  assert.equal(evidence.preInferenceGit.headRevisionId, artifactRevisionId);
  assert.deepEqual(evidence.implementationPaths, ["feature.mjs"]);
  assert.equal(evidence.evidenceSource, "synthetic");
  assert.equal(evidence.advancementEligibility, "ineligible");
  assert.equal(requests.length, 3);
  const body = JSON.parse(requests[1].options.body);
  assert.equal(body.model, "gemma-real-instance");
  assert.equal(body.store, false);
  assert.equal(body.tools, undefined);
  assert.equal(requests[1].url, "http://127.0.0.1:1234/api/v1/chat");

  const omittedDependenciesRequest = structuredClone(request);
  omittedDependenciesRequest.validationRequestId = `${request.validationRequestId}:omitted-dependencies`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  let omittedDependenciesEvidence;
  try {
    omittedDependenciesEvidence = await runMackLocalValidation(omittedDependenciesRequest, runnerOptions(omittedDependenciesRequest));
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(omittedDependenciesEvidence.evidenceSource, "synthetic");
  assert.equal(omittedDependenciesEvidence.productionEligibility, "ineligible");
  assert.equal(omittedDependenciesEvidence.advancementEligibility, "ineligible");
  assert.equal(omittedDependenciesEvidence.reasonCodes.includes("SYNTHETIC_EVIDENCE"), true);
  const freshSyntheticRunner = await import(`../scripts/model/mack-validation-runner.mjs?synthetic-replay=${Date.now()}`);
  const replayedSynthetic = await freshSyntheticRunner.runMackLocalValidation(omittedDependenciesRequest, runnerOptions(omittedDependenciesRequest));
  assert.deepEqual(replayedSynthetic, omittedDependenciesEvidence);

  let cliRequest;
  const server = createServer((incoming, response) => {
    response.setHeader("content-type", "application/json");
    if (incoming.url === "/api/v1/models") {
      response.end(JSON.stringify({ models: [{ key: cliRequest.model.modelKey, loaded_instances: [{ id: "gemma-cli-instance" }] }] }));
      return;
    }
    if (incoming.url === "/api/v1/chat") {
      response.end(JSON.stringify({ model: "gemma-cli-instance", output: [{ type: "message", content: JSON.stringify(candidate(cliRequest)) }], stats: { input_tokens: 20, output_tokens: 8, total_tokens: 28 } }));
      return;
    }
    response.statusCode = 404;
    response.end("{}");
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  t.after(() => new Promise((resolveClose) => server.close(resolveClose)));
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  cliRequest = structuredClone(request);
  cliRequest.validationRequestId = `${request.validationRequestId}:cli-production`;
  cliRequest.model.baseUrl = `http://127.0.0.1:${address.port}`;
  const cliReplayRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-mack-cli-replay-")));
  t.after(() => rm(cliReplayRoot, { recursive: true, force: true }));
  const cliOptions = runnerOptions(cliRequest, { replayRegistryRoot: cliReplayRoot });
  const productionEvidence = await runRunnerCli(cliRequest, cliOptions);
  assert.equal(productionEvidence.evidenceSource, "production");
  assert.equal(productionEvidence.productionEligibility, "eligible");
  assert.equal(productionEvidence.advancementEligibility, "eligible");
  assert.equal(productionEvidence.reasonCodes.includes("SYNTHETIC_EVIDENCE"), false);
  const normalizedCliRequest = normalizeMackLocalValidationRequestV1(cliRequest);
  assert.equal(normalizedCliRequest.state, "valid");
  const protectedReadback = await readMackProductionValidationRegistryV1(cliRequest, {
    replayRegistryRoot: cliReplayRoot,
    validationRequestId: cliRequest.validationRequestId,
    requestDigest: normalizedCliRequest.requestDigest,
  });
  assert.equal(protectedReadback.state, "verified");
  assert.deepEqual(protectedReadback.evidence, productionEvidence);
  assert.equal(protectedReadback.record.path, replayPath(cliReplayRoot, cliRequest, "json"));
  const replayedProduction = await runRunnerCli(cliRequest, cliOptions);
  assert.deepEqual(replayedProduction, productionEvidence);
  const freshProductionRunner = await import(`../scripts/model/mack-validation-runner.mjs?production-replay=${Date.now()}`);
  await assert.rejects(
    () => freshProductionRunner.runMackLocalValidation(cliRequest, cliOptions, { canonicalPath: async () => { throw new Error("imported_production_replay_must_not_run"); } }),
    /mack_replay_registry_evidence_invalid/u,
  );

  const substitutedRequest = structuredClone(request);
  substitutedRequest.validationRequestId = `${request.validationRequestId}:provider-substitution`;
  let substitutedCall = 0;
  const substitutedFetch = async (url) => {
    substitutedCall += 1;
    if (url.endsWith("/api/v1/models")) return new Response(JSON.stringify(metadata), { status: 200 });
    return new Response(JSON.stringify({ provider: "other-provider", model: "other-instance", output: [{ type: "message", content }] }), { status: 200 });
  };
  await assert.rejects(
    () => runMackLocalValidation(substitutedRequest, runnerOptions(substitutedRequest), { fetchImpl: substitutedFetch }),
    /mack_model_provider_substitution/u,
  );
  assert.equal(substitutedCall, 2);
});
