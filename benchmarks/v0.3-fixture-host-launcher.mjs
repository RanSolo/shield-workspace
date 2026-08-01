import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const LAUNCHER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const HEX64 = /^[0-9a-f]{64}$/u;
const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const ID = /^[a-z0-9](?:[a-z0-9._-]{0,63})$/u;
const SANDBOX_EXECUTABLE = "/usr/bin/sandbox-exec";
const WORKER_SOURCE = resolve(LAUNCHER_ROOT, "v0.3-fixture-isolation-worker.mjs");
const EXPECTED_ISOLATION_ENVELOPE_DIGEST = "607527031f4386409cc76f1fb81250634cd2e8b4a53a37632ee9219bf2adf79a";
const POLICY_CONTRACT = JSON.stringify({
  schemaVersion: "shield.fixture.denial-policy.v1",
  network: "deny",
  writes: "workspace-only",
  processExec: "pinned-node-only"
});
const execFileAsync = promisify(execFile);

function json(value) {
  return JSON.stringify(value);
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function inside(path, fixtureRoot) {
  const relation = relative(fixtureRoot, path);
  return relation === "" ||
    (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

async function regularExternalFile(path, fixtureRoot) {
  const info = await lstat(path).catch(() => null);
  if (info === null || !info.isFile() || info.isSymbolicLink()) return null;
  const resolved = await realpath(path).catch(() => null);
  if (resolved === null || inside(resolved, fixtureRoot)) return null;
  return resolved;
}

async function readNoFollow(path) {
  if (!Number.isInteger(constants.O_NOFOLLOW)) throw new Error("no_follow_unavailable");
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat({ bigint: true });
    if (!info.isFile()) throw new Error("input_not_regular");
    return Object.freeze({
      bytes: await handle.readFile(),
      mode: Number(info.mode & 0o777n),
      uid: info.uid,
      gid: info.gid,
      dev: info.dev,
      ino: info.ino
    });
  } finally {
    await handle.close();
  }
}

async function readExternalJson(path, fixtureRoot) {
  const resolved = await regularExternalFile(path, fixtureRoot);
  if (resolved === null) throw new Error("external_trust_input_not_regular");
  return JSON.parse((await readNoFollow(resolved)).bytes.toString("utf8"));
}

export async function loadTrustedReplayAnchor({ anchorPath, fixtureRoot }) {
  const root = await realpath(resolve(fixtureRoot)).catch(() => null);
  if (root === null) throw new Error("external_trust_input_not_regular");
  const envelope = await readExternalJson(resolve(anchorPath), root);
  if (envelope?.kind !== "trusted-journal-replay-anchor-envelope" ||
      !HEX64.test(envelope.digest) ||
      envelope.projection === null || typeof envelope.projection !== "object") {
    throw new Error("trusted_replay_anchor_malformed");
  }
  const projectionBytes = Buffer.from(json(envelope.projection));
  if (digest(projectionBytes) !== envelope.digest) throw new Error("trusted_replay_anchor_digest_mismatch");
  return Object.freeze(envelope.projection);
}

function plain(value) {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value, fields) {
  return plain(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field));
}

function closedDataObject(value, fields) {
  if (!plain(value) || Reflect.ownKeys(value).length !== fields.length) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return fields.every((field) => Object.hasOwn(descriptors, field) &&
    Object.hasOwn(descriptors[field], "value") && descriptors[field].enumerable);
}

const ENVELOPE_FIELDS = Object.freeze(["schemaVersion", "adapter", "denialPolicy", "worker"]);
const ADAPTER_FIELDS = Object.freeze(["adapterId", "contractVersion", "executableSha256", "cdHashSha256"]);
const POLICY_FIELDS = Object.freeze(["policyId", "policySha256"]);
const WORKER_FIELDS = Object.freeze(["entryPoint", "sha256"]);

export async function loadTrustedIsolationEnvelope({ envelopePath, fixtureRoot }) {
  const root = await realpath(resolve(fixtureRoot)).catch(() => null);
  if (root === null) throw new Error("external_trust_input_not_regular");
  const resolved = await regularExternalFile(resolve(envelopePath), root);
  if (resolved === null) throw new Error("external_trust_input_not_regular");
  const { bytes } = await readNoFollow(resolved);
  if (digest(bytes) !== EXPECTED_ISOLATION_ENVELOPE_DIGEST) {
    throw new Error("isolation_envelope_digest_mismatch");
  }
  let value;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("isolation_envelope_malformed");
  }
  if (!closedDataObject(value, ENVELOPE_FIELDS) ||
      value.schemaVersion !== "shield.fixture.isolation-envelope.v1" ||
      !closedDataObject(value.adapter, ADAPTER_FIELDS) || !ID.test(value.adapter.adapterId) ||
      value.adapter.contractVersion !== "v1" || !HEX64.test(value.adapter.executableSha256) ||
      !HEX64.test(value.adapter.cdHashSha256) ||
      !closedDataObject(value.denialPolicy, POLICY_FIELDS) || !ID.test(value.denialPolicy.policyId) ||
      !HEX64.test(value.denialPolicy.policySha256) ||
      !closedDataObject(value.worker, WORKER_FIELDS) ||
      value.worker.entryPoint !== "v0.3-fixture-isolation-worker.mjs" || !HEX64.test(value.worker.sha256)) {
    throw new Error("isolation_envelope_malformed");
  }
  return Object.freeze({
    schemaVersion: value.schemaVersion,
    adapter: Object.freeze({ ...value.adapter }),
    denialPolicy: Object.freeze({ ...value.denialPolicy }),
    worker: Object.freeze({ ...value.worker })
  });
}

const HOST_CONTEXT_FIELDS = Object.freeze([
  "baselinePath",
  "authoritativeReceiptJournalPath",
  "attributionContext",
  "toolingContext"
]);

export async function launchExternalFixture({ fixtureRoot, operatorInput, hostContext }) {
  if (!exact(hostContext, HOST_CONTEXT_FIELDS) ||
      typeof hostContext.baselinePath !== "string" ||
      hostContext.baselinePath.length === 0 ||
      hostContext.authoritativeReceiptJournalPath !== null ||
      hostContext.attributionContext !== null ||
      hostContext.toolingContext !== null) {
    throw new Error("host_context_not_closed");
  }
  const root = await realpath(resolve(fixtureRoot)).catch(() => null);
  if (root === null) throw new Error("fixture_root_not_regular");
  let baseline;
  try {
    baseline = await readExternalJson(resolve(hostContext.baselinePath), root);
  } catch (error) {
    if (error instanceof Error && error.message === "external_trust_input_not_regular") {
      throw new Error("baseline_path_not_regular");
    }
    throw error;
  }
  const launcherBytes = await readFile(fileURLToPath(import.meta.url));
  if (baseline.launcherDigest !== digest(launcherBytes)) throw new Error("launcher_digest_mismatch");

  const verifierPath = resolve(root, "verify-fixture-identity.mjs");
  const verifierBytes = await readFile(verifierPath);
  if (baseline.verifierDigest !== digest(verifierBytes)) throw new Error("verifier_digest_mismatch");

  const verifier = await import(pathToFileURL(verifierPath).href);
  const identity = await verifier.verifyFixtureIdentity(root, baseline);
  if (identity.state !== "valid") return identity;
  const driver = await import(pathToFileURL(resolve(root, "src/driver.mjs")).href);
  return driver.composeMinimumFixture(operatorInput, Object.freeze({
    releaseBaseline: baseline,
    validatedToolingContext: null,
    authoritativeReceiptEntries: null,
    attributionContext: null
  }));
}

const GRADING_HOST_FIELDS = Object.freeze([
  "baselinePath", "isolationEnvelopePath", "interruptAfterPhase"
]);
const SNAPSHOT_PATHS = Object.freeze(["src/greeting.mjs", "test/greeting.test.mjs"]);

async function git(cwd, args, encoding = "utf8", maxBuffer = 512 * 1024) {
  return execFileAsync("git", args, { cwd, encoding, timeout: 15_000, maxBuffer });
}

async function checkoutSnapshot(operatorRoot) {
  const head = (await git(operatorRoot, ["rev-parse", "HEAD"])).stdout.trim();
  const status = (await git(operatorRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"], "buffer")).stdout;
  const files = [];
  for (const path of SNAPSHOT_PATHS) {
    const absolute = resolve(operatorRoot, path);
    const info = await lstat(absolute);
    if (!info.isFile() || info.isSymbolicLink() || await realpath(absolute) !== absolute) {
      throw new Error("operator_file_not_regular");
    }
    files.push(Object.freeze({ path, mode: info.mode & 0o777, sha256: digest(await readFile(absolute)) }));
  }
  return Object.freeze({ head, status, files: Object.freeze(files) });
}

function snapshotsEqual(left, right) {
  return left.head === right.head && left.status.equals(right.status) &&
    JSON.stringify(left.files) === JSON.stringify(right.files);
}

async function openTrustedAdapter(envelope) {
  if (process.platform !== "darwin" || await realpath(SANDBOX_EXECUTABLE).catch(() => null) !== SANDBOX_EXECUTABLE ||
      !Number.isInteger(constants.O_NOFOLLOW)) throw new Error("isolation_not_observable");
  const handle = await open(SANDBOX_EXECUTABLE, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    if (!info.isFile() || info.uid !== 0n || info.gid !== 0n || Number(info.mode & 0o022n) !== 0 ||
        digest(bytes) !== envelope.adapter.executableSha256) throw new Error("isolation_not_observable");
    return { handle, bytes, identity: Object.freeze({ dev: info.dev, ino: info.ino, mode: info.mode, uid: info.uid, gid: info.gid }) };
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function hostEvidence(executable, args) {
  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      encoding: "utf8", timeout: 5_000, maxBuffer: 64 * 1024,
      env: Object.freeze({ PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" })
    });
    return Object.freeze({ state: "passed", bytes: Buffer.from(`${stdout}${stderr}`, "utf8") });
  } catch (error) {
    return Object.freeze({
      state: "failed",
      bytes: Buffer.from(`${typeof error?.stdout === "string" ? error.stdout : ""}${typeof error?.stderr === "string" ? error.stderr : ""}`, "utf8")
    });
  }
}

async function verifyProtectedAdapter(source, envelope, nonce) {
  const current = await lstat(SANDBOX_EXECUTABLE, { bigint: true }).catch(() => null);
  const opened = await source.handle.stat({ bigint: true }).catch(() => null);
  if (current === null || opened === null || !current.isFile() || current.isSymbolicLink() ||
      current.dev !== source.identity.dev || current.ino !== source.identity.ino ||
      opened.dev !== source.identity.dev || opened.ino !== source.identity.ino ||
      await realpath(SANDBOX_EXECUTABLE).catch(() => null) !== SANDBOX_EXECUTABLE) {
    throw new Error("isolation_not_observable");
  }
  const [flags, sip, authenticatedRoot, signature, details] = await Promise.all([
    hostEvidence("/usr/bin/stat", ["-f", "%Sf", SANDBOX_EXECUTABLE]),
    hostEvidence("/usr/bin/csrutil", ["status"]),
    hostEvidence("/usr/bin/csrutil", ["authenticated-root", "status"]),
    hostEvidence("/usr/bin/codesign", ["--verify", "--strict", "--verbose=2", "-R=anchor apple and identifier \"com.apple.sandbox-exec\"", SANDBOX_EXECUTABLE]),
    hostEvidence("/usr/bin/codesign", ["-dvvv", SANDBOX_EXECUTABLE])
  ]);
  const detailText = details.bytes.toString("utf8");
  if ([flags, sip, authenticatedRoot, signature, details].some(({ state }) => state !== "passed") ||
      !flags.bytes.toString("utf8").split(/[ ,\n]/u).includes("restricted") ||
      !sip.bytes.toString("utf8").includes("System Integrity Protection status: enabled.") ||
      !authenticatedRoot.bytes.toString("utf8").includes("Authenticated Root status: enabled") ||
      !detailText.includes("Identifier=com.apple.sandbox-exec") ||
      !detailText.includes(`CandidateCDHashFull sha256=${envelope.adapter.cdHashSha256}`)) {
    throw new Error("isolation_not_observable");
  }
  return Object.freeze({
    nonce,
    digest: digest(Buffer.concat([Buffer.from(nonce), flags.bytes, sip.bytes, authenticatedRoot.bytes, signature.bytes, details.bytes]))
  });
}

async function copySealed(bytes, destination, expectedDigest, executable) {
  if (digest(bytes) !== expectedDigest) throw new Error("trusted_source_digest_mismatch");
  const handle = await open(destination, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o700);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(destination, executable ? 0o500 : 0o400);
  const readback = await readNoFollow(destination);
  if (digest(readback.bytes) !== expectedDigest || readback.mode !== (executable ? 0o500 : 0o400)) {
    throw new Error("private_copy_identity_mismatch");
  }
}

function sandboxProfile(workspaceRoot, nodePath) {
  const quoted = (value) => JSON.stringify(value);
  return [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    `(allow file-write* (subpath ${quoted(workspaceRoot)}))`,
    "(deny process-exec)",
    `(allow process-exec (literal ${quoted(nodePath)}))`,
    "(deny network*)"
  ].join("\n");
}

async function phaseFileIdentity(root, path) {
  const info = await lstat(resolve(root, path));
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("workspace_file_not_regular");
  return Object.freeze({ sha256: digest(await readFile(resolve(root, path))), mode: info.mode & 0o777 });
}

async function runIsolatedPhase({
  adapterPath, workerPath, workspaceRoot, baseRevision, headRevision, phase,
  sequence, nonce, envelope, nodeIdentity, interruptAfterPhase, adapterVerifier
}) {
  const target = await phaseFileIdentity(workspaceRoot, "src/greeting.mjs");
  const test = await phaseFileIdentity(workspaceRoot, "test/greeting.test.mjs");
  const invocationId = digest(Buffer.from(`${nonce}:${sequence}:${phase}`, "utf8"));
  let hostProof;
  try {
    hostProof = await adapterVerifier(invocationId);
  } catch {
    return Object.freeze({ state: "blocked", reason: "isolation_not_observable", phase, reaped: true });
  }
  const request = Object.freeze({
    schemaVersion: "shield.fixture.isolation-request.v1",
    invocationId,
    workspaceRoot,
    baseRevision,
    headRevision,
    phase,
    targetSha256: target.sha256,
    targetMode: target.mode,
    testSha256: test.sha256,
    testMode: test.mode,
    executableSha256: nodeIdentity,
    argv: Object.freeze(phase === "isolation.probe" ? ["probe"] : ["--test", "test/greeting.test.mjs"]),
    adapterId: envelope.adapter.adapterId,
    policyId: envelope.denialPolicy.policyId,
    hostEvidenceDigest: hostProof.digest,
    timeoutMs: 30_000,
    maxOutputBytes: 262_144
  });
  const requestPath = resolve(workspaceRoot, "request.json");
  await writeFile(requestPath, JSON.stringify(request), { mode: 0o600, flag: "wx" });
  const profile = sandboxProfile(workspaceRoot, process.execPath);
  const child = spawn(adapterPath, ["-p", profile, process.execPath, workerPath, requestPath], {
    cwd: workspaceRoot,
    env: Object.freeze({ PATH: "", HOME: workspaceRoot, TMPDIR: workspaceRoot }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  let interrupted = false;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (stdout.length > 262_144) child.kill("SIGKILL");
    if (!interrupted && interruptAfterPhase === phase && stdout.includes('"checkpoint":"worker.started"')) {
      interrupted = true;
      child.kill("SIGKILL");
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    if (stderr.length > 262_144) child.kill("SIGKILL");
  });
  const exit = await new Promise((resolveExit) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 35_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      resolveExit({ error });
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolveExit({ code, signal });
    });
  });
  await rm(requestPath, { force: true });
  try {
    const afterProof = await adapterVerifier(invocationId);
    if (afterProof.digest !== hostProof.digest) throw new Error("host_evidence_changed");
  } catch {
    return Object.freeze({ state: "blocked", reason: "isolation_not_observable", phase, reaped: true });
  }
  if (interrupted) return Object.freeze({ state: "blocked", reason: "worker_interrupted", phase, reaped: true });
  if (exit.error || exit.code !== 0 || exit.signal !== null) {
    return Object.freeze({ state: "blocked", reason: "worker_execution_uncertain", phase, reaped: true });
  }
  const lines = stdout.trim().split("\n").filter(Boolean);
  if (lines.length !== 2) return Object.freeze({ state: "blocked", reason: "worker_receipt_malformed", phase, reaped: true });
  let terminal;
  try {
    terminal = JSON.parse(lines[1]);
  } catch {
    return Object.freeze({ state: "blocked", reason: "worker_receipt_malformed", phase, reaped: true });
  }
  const receipt = terminal?.receipt;
  const expected = {
    invocationId, workspaceRoot, baseRevision, headRevision, phase,
    targetSha256: target.sha256, targetMode: target.mode,
    testSha256: test.sha256, testMode: test.mode,
    executableSha256: nodeIdentity, argv: request.argv,
    adapterId: envelope.adapter.adapterId, policyId: envelope.denialPolicy.policyId,
    hostEvidenceDigest: hostProof.digest
  };
  if (!plain(receipt) || Object.entries(expected).some(([key, value]) =>
    JSON.stringify(receipt[key]) !== JSON.stringify(value)) ||
    !["passed", "failed", "timeout", "unavailable", "denied"].includes(receipt.outcome) || !HEX64.test(receipt.outputSha256)) {
    return Object.freeze({ state: "blocked", reason: "worker_receipt_mismatch", phase, reaped: true });
  }
  const targetAfter = await phaseFileIdentity(workspaceRoot, "src/greeting.mjs");
  const testAfter = await phaseFileIdentity(workspaceRoot, "test/greeting.test.mjs");
  if (JSON.stringify(targetAfter) !== JSON.stringify(target) || JSON.stringify(testAfter) !== JSON.stringify(test)) {
    return Object.freeze({ state: "blocked", reason: "worker_workspace_mutated", phase, reaped: true });
  }
  return Object.freeze({ state: "terminal", phase, outcome: receipt.outcome, invocationId, reaped: true });
}

export async function gradeExternalFixture({
  fixtureRoot, operatorRepositoryRoot, baseRevision, headRevision, hostContext
}) {
  if (typeof fixtureRoot !== "string" || typeof operatorRepositoryRoot !== "string" ||
      !REVISION.test(baseRevision) || !REVISION.test(headRevision) || baseRevision.length !== headRevision.length ||
      !closedDataObject(hostContext, GRADING_HOST_FIELDS) || typeof hostContext.baselinePath !== "string" ||
      typeof hostContext.isolationEnvelopePath !== "string" ||
      !(hostContext.interruptAfterPhase === null || ["grade.candidate", "grade.injected", "grade.restored"].includes(hostContext.interruptAfterPhase))) {
    return Object.freeze({ state: "invalid", reason: "fixture_grading_input_not_closed" });
  }
  const benchmarkRoot = await realpath(resolve(fixtureRoot)).catch(() => null);
  const operatorRoot = await realpath(resolve(operatorRepositoryRoot)).catch(() => null);
  if (benchmarkRoot === null || operatorRoot === null || benchmarkRoot === operatorRoot) {
    return Object.freeze({ state: "blocked", reason: "fixture_root_not_regular" });
  }
  let before;
  try {
    before = await checkoutSnapshot(operatorRoot);
  } catch {
    return Object.freeze({ state: "blocked", reason: "operator_snapshot_unavailable" });
  }
  if (before.head !== headRevision || before.status.length !== 0) {
    return Object.freeze({ state: "blocked", reason: "operator_revision_not_exact" });
  }
  let supervisorRoot = null;
  let adapterSource = null;
  let result = Object.freeze({ state: "blocked", reason: "isolation_not_observable" });
  try {
    let baseline;
    try {
      baseline = await readExternalJson(resolve(hostContext.baselinePath), benchmarkRoot);
    } catch {
      return Object.freeze({ state: "blocked", reason: "baseline_path_not_regular" });
    }
    const launcherBytes = await readFile(fileURLToPath(import.meta.url));
    if (baseline.launcherDigest !== digest(launcherBytes)) return Object.freeze({ state: "blocked", reason: "launcher_digest_mismatch" });
    const verifierPath = resolve(benchmarkRoot, "verify-fixture-identity.mjs");
    if (baseline.verifierDigest !== digest(await readFile(verifierPath))) return Object.freeze({ state: "blocked", reason: "verifier_digest_mismatch" });
    const verifier = await import(pathToFileURL(verifierPath).href);
    const identity = await verifier.verifyFixtureIdentity(benchmarkRoot, baseline);
    if (identity.state !== "valid") return identity;
    const driver = await import(pathToFileURL(resolve(benchmarkRoot, "src/driver.mjs")).href);
    const revisionInspection = await driver.inspectExternalRevision({
      externalRepositoryRoot: operatorRoot,
      baseRevision,
      headRevision
    });
    if (revisionInspection.state !== "measured") return revisionInspection;

    let envelope;
    try {
      envelope = await loadTrustedIsolationEnvelope({
        envelopePath: hostContext.isolationEnvelopePath,
        fixtureRoot: benchmarkRoot
      });
    } catch (error) {
      return Object.freeze({ state: "blocked", reason: error instanceof Error ? error.message : "isolation_envelope_malformed" });
    }
    if (process.platform !== "darwin") return Object.freeze({ state: "blocked", reason: "isolation_not_observable" });
    const policyDigest = digest(Buffer.from(POLICY_CONTRACT));
    if (policyDigest !== envelope.denialPolicy.policySha256) {
      return Object.freeze({ state: "blocked", reason: "denial_policy_identity_mismatch" });
    }
    adapterSource = await openTrustedAdapter(envelope).catch(() => null);
    const workerSource = await readNoFollow(WORKER_SOURCE).catch(() => null);
    const nodeSource = await readNoFollow(process.execPath).catch(() => null);
    if (adapterSource === null || workerSource === null || nodeSource === null ||
        digest(adapterSource.bytes) !== envelope.adapter.executableSha256 ||
        digest(workerSource.bytes) !== envelope.worker.sha256) {
      return Object.freeze({ state: "blocked", reason: "isolation_capability_identity_mismatch" });
    }

    supervisorRoot = await mkdtemp(join(tmpdir(), "shield-v03-supervisor-"));
    supervisorRoot = await realpath(supervisorRoot);
    await chmod(supervisorRoot, 0o700);
    const workspaceRoot = resolve(supervisorRoot, "workspace");
    const binRoot = resolve(supervisorRoot, "bin");
    await mkdir(workspaceRoot, { mode: 0o700 });
    await mkdir(binRoot, { mode: 0o700 });
    const archive = (await git(operatorRoot, ["archive", "--format=tar", headRevision], "buffer", 64 * 1024 * 1024)).stdout;
    const archivePath = resolve(supervisorRoot, "head.tar");
    await writeFile(archivePath, archive, { mode: 0o600, flag: "wx" });
    await execFileAsync("tar", ["-x", "-f", archivePath, "-C", workspaceRoot], { timeout: 15_000, maxBuffer: 64 * 1024 });
    await rm(archivePath);
    const materializedTarget = await phaseFileIdentity(workspaceRoot, "src/greeting.mjs");
    const materializedTest = await phaseFileIdentity(workspaceRoot, "test/greeting.test.mjs");
    if (materializedTarget.sha256 !== before.files[0].sha256 || materializedTarget.mode !== before.files[0].mode ||
        materializedTest.sha256 !== before.files[1].sha256 || materializedTest.mode !== before.files[1].mode) {
      return Object.freeze({ state: "blocked", reason: "materialized_head_identity_mismatch" });
    }
    const adapterPath = SANDBOX_EXECUTABLE;
    const workerPath = resolve(binRoot, envelope.worker.entryPoint);
    await copySealed(workerSource.bytes, workerPath, envelope.worker.sha256, true);
    const nonce = digest(Buffer.from(`${Date.now()}:${process.pid}:${supervisorRoot}`));
    const common = { adapterPath, workerPath, workspaceRoot, baseRevision, headRevision, nonce, envelope,
      nodeIdentity: digest(nodeSource.bytes), interruptAfterPhase: hostContext.interruptAfterPhase,
      adapterVerifier: (invocationId) => verifyProtectedAdapter(adapterSource, envelope, invocationId) };
    const probe = await runIsolatedPhase({ ...common, phase: "isolation.probe", sequence: 0 });
    if (probe.state !== "terminal" || probe.outcome !== "passed") {
      return Object.freeze({ state: "blocked", reason: "isolation_not_observable" });
    }
    const candidate = await runIsolatedPhase({ ...common, phase: "grade.candidate", sequence: 1 });
    if (candidate.state !== "terminal") { result = candidate; return result; }
    if (candidate.outcome !== "passed") return Object.freeze({ state: "blocked", reason: "candidate_test_not_passed" });
    const candidateBytes = await readFile(resolve(workspaceRoot, "src/greeting.mjs"));
    const defectBytes = await readFile(resolve(benchmarkRoot, "template/src/greeting.mjs"));
    await writeFile(resolve(workspaceRoot, "src/greeting.mjs"), defectBytes);
    const injected = await runIsolatedPhase({ ...common, phase: "grade.injected", sequence: 2 });
    if (injected.state !== "terminal") { result = injected; return result; }
    if (injected.outcome !== "failed") return Object.freeze({ state: "blocked", reason: "failure_injection_not_observed" });
    await writeFile(resolve(workspaceRoot, "src/greeting.mjs"), candidateBytes);
    const restored = await runIsolatedPhase({ ...common, phase: "grade.restored", sequence: 3 });
    if (restored.state !== "terminal") { result = restored; return result; }
    if (restored.outcome !== "passed" || digest(await readFile(resolve(workspaceRoot, "src/greeting.mjs"))) !== digest(candidateBytes)) {
      return Object.freeze({ state: "blocked", reason: "rollback_mismatch" });
    }
    result = Object.freeze({
      state: "passed",
      authority: "fixture-only-non-authoritative",
      externalRevision: Object.freeze({ baseRevision, headRevision, changedPaths: Object.freeze(["src/greeting.mjs"]) }),
      candidateSha256: digest(candidateBytes),
      injectedDefectSha256: digest(defectBytes),
      injectedOutcome: injected.outcome,
      rollbackOutcome: restored.outcome,
      restoredSha256: digest(candidateBytes),
      capabilityIsolation: Object.freeze({ state: "verified-denied", adapterId: envelope.adapter.adapterId,
        policyId: envelope.denialPolicy.policyId, network: "denied", hostWrites: "workspace-only" })
    });
  } catch {
    result = Object.freeze({ state: "blocked", reason: "isolated_execution_uncertain" });
  } finally {
    if (adapterSource !== null) await adapterSource.handle.close().catch(() => {});
    let cleanup = true;
    if (supervisorRoot !== null) {
      await rm(supervisorRoot, { recursive: true, force: true }).catch(() => { cleanup = false; });
      if (await stat(supervisorRoot).then(() => true, () => false)) cleanup = false;
    }
    let integrity = false;
    try {
      integrity = snapshotsEqual(before, await checkoutSnapshot(operatorRoot));
    } catch {
      integrity = false;
    }
    if (!cleanup || !integrity) return Object.freeze({
      state: "blocked",
      reason: !cleanup ? "disposable_cleanup_failed" : "operator_integrity_mismatch"
    });
  }
  return result;
}
