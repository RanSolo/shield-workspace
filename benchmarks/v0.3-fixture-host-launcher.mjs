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
const EXPECTED_ISOLATION_ENVELOPE_DIGEST = "ac887155333af5d98cc0fcb19458a54664e3d27417a15c7b77aff502994cc3bb";
const POLICY_CONTRACT = JSON.stringify({
  schemaVersion: "shield.fixture.denial-policy.v1",
  network: "deny",
  writes: "workspace-only",
  processExec: "pinned-node-only"
});
const ISOLATION_FAULTS = Object.freeze([
  "pre-spawn-evidence-drift", "private-worker-substitution",
  "reap-evidence-uncertain", "cleanup-failure"
]);
const ISOLATION_REQUEST_FIELDS = Object.freeze([
  "schemaVersion", "invocationId", "workspaceRoot", "baseRevision", "headRevision",
  "phase", "targetSha256", "targetMode", "testSha256", "testMode", "executableSha256",
  "workerSha256", "probeSha256", "argv", "adapterId", "adapterPath", "adapterSha256",
  "adapterCdHashSha256", "adapterArgv", "policyId", "policyContractSha256",
  "concretePolicySha256", "hostEvidenceDigest", "executionPermitPath", "timeoutMs", "maxOutputBytes"
]);
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

export function validateIsolationReceipt(terminal, request) {
  if (!closedDataObject(request, ISOLATION_REQUEST_FIELDS) ||
      request.schemaVersion !== "shield.fixture.isolation-request.v1") return false;
  const receipt = terminal?.receipt;
  const expectedReceiptFields = Object.freeze([...ISOLATION_REQUEST_FIELDS, "outcome", "outputSha256"]);
  return closedDataObject(terminal, ["receipt"]) &&
    closedDataObject(receipt, expectedReceiptFields) &&
    receipt.schemaVersion === "shield.fixture.isolation-receipt.v1" &&
    ISOLATION_REQUEST_FIELDS.every((key) => key === "schemaVersion" ||
      JSON.stringify(receipt[key]) === JSON.stringify(request[key])) &&
    ["passed", "failed", "timeout", "unavailable", "denied"].includes(receipt.outcome) &&
    HEX64.test(receipt.outputSha256);
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
  "baselinePath", "isolationEnvelopePath", "interruptAfterPhase", "failAfterCheckpoint", "faultInjection"
]);
const HOST_CHECKPOINTS = Object.freeze([
  "workspace.prepared", "candidate.passed", "defect.injected", "injected.failed",
  "candidate.restored", "restored.passed", "workspace.removed", "operator.reverified"
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

export function adapterMetadataMatches(sourceIdentity, current, opened) {
  return current !== null && opened !== null && current.isFile() && !current.isSymbolicLink() &&
    current.dev === sourceIdentity.dev && current.ino === sourceIdentity.ino &&
    current.mode === sourceIdentity.mode && current.uid === sourceIdentity.uid && current.gid === sourceIdentity.gid &&
    opened.dev === sourceIdentity.dev && opened.ino === sourceIdentity.ino &&
    opened.mode === sourceIdentity.mode && opened.uid === sourceIdentity.uid && opened.gid === sourceIdentity.gid &&
    current.uid === 0n && current.gid === 0n && Number(current.mode & 0o022n) === 0;
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
  if (!adapterMetadataMatches(source.identity, current, opened) ||
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

function createAdapterVerifier(source, envelope, faultInjection) {
  const calls = new Map();
  return async (invocationId) => {
    const proof = await verifyProtectedAdapter(source, envelope, invocationId);
    const count = (calls.get(invocationId) ?? 0) + 1;
    calls.set(invocationId, count);
    if (faultInjection === "pre-spawn-evidence-drift" && count === 2) {
      return Object.freeze({ ...proof, digest: "0".repeat(64) });
    }
    return proof;
  };
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
  await verifySealedPrivateCopy(destination, expectedDigest, executable);
}

export async function verifySealedPrivateCopy(path, expectedDigest, executable) {
  const readback = await readNoFollow(path);
  if (digest(readback.bytes) !== expectedDigest || readback.mode !== (executable ? 0o500 : 0o400)) {
    throw new Error("private_copy_identity_mismatch");
  }
  return true;
}

export async function loadTrustedWorkerSource(workerPath, expectedDigest) {
  const source = await readNoFollow(workerPath);
  if (digest(source.bytes) !== expectedDigest) throw new Error("isolation_capability_identity_mismatch");
  return source;
}

export function hostEvidenceStable(before, after) {
  return plain(before) && plain(after) && typeof before.nonce === "string" &&
    before.nonce === after.nonce && typeof before.digest === "string" && before.digest === after.digest;
}

export function cleanupEvidenceState(removalFailed, rootStillExists) {
  return removalFailed === false && rootStillExists === false ? "verified-removed" : "uncertain";
}

async function captureDisposableRoot(root, prefix) {
  const canonicalTmp = await realpath(tmpdir());
  const canonicalRoot = await realpath(root);
  const info = await lstat(canonicalRoot, { bigint: true });
  if (dirname(canonicalRoot) !== canonicalTmp || !canonicalRoot.startsWith(resolve(canonicalTmp, prefix)) ||
      !info.isDirectory() || info.isSymbolicLink() || Number(info.mode & 0o777n) !== 0o700) {
    throw new Error("disposable_root_identity_invalid");
  }
  return Object.freeze({ path: canonicalRoot, dev: info.dev, ino: info.ino, prefix });
}

async function removeDisposableRoot(identity) {
  const current = await lstat(identity.path, { bigint: true }).catch(() => null);
  const canonicalTmp = await realpath(tmpdir());
  if (current === null || dirname(identity.path) !== canonicalTmp ||
      !identity.path.startsWith(resolve(canonicalTmp, identity.prefix)) || !current.isDirectory() ||
      current.isSymbolicLink() || current.dev !== identity.dev || current.ino !== identity.ino) return false;
  let removalFailed = false;
  await rm(identity.path, { recursive: true, force: true }).catch(() => { removalFailed = true; });
  const rootStillExists = await stat(identity.path).then(() => true, () => false);
  return cleanupEvidenceState(removalFailed, rootStillExists) === "verified-removed";
}

function sandboxProfile(workspaceRoot, nodePath) {
  const quoted = (value) => JSON.stringify(value);
  return [
    "(version 1)",
    "(allow default)",
    "(deny file-write*)",
    `(allow file-write* (subpath ${quoted(workspaceRoot)}))`,
    `(deny process-exec (require-not (literal ${quoted(nodePath)})))`,
    "(deny network*)"
  ].join("\n");
}

function processGroupExists(child) {
  if (!Number.isInteger(child.pid)) return false;
  try {
    process.kill(-child.pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

function killProcessGroup(child) {
  if (!Number.isInteger(child.pid)) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (error) {
    if (error?.code !== "ESRCH") child.kill("SIGKILL");
  }
}

async function reapProcessGroup(child) {
  if (!processGroupExists(child)) return true;
  killProcessGroup(child);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (!processGroupExists(child)) return true;
    await new Promise((done) => setTimeout(done, 10));
  }
  return !processGroupExists(child);
}

async function phaseFileIdentity(root, path) {
  const info = await lstat(resolve(root, path));
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("workspace_file_not_regular");
  return Object.freeze({ sha256: digest(await readFile(resolve(root, path))), mode: info.mode & 0o777 });
}

async function runIsolatedPhase({
  adapterPath, workerBytes, binRoot, workspaceRoot, baseRevision, headRevision, phase,
  sequence, nonce, envelope, nodeIdentity, nodeBytes, interruptAfterPhase, faultInjection, adapterVerifier
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
  const requestPath = resolve(workspaceRoot, "request.json");
  const permitPath = resolve(workspaceRoot, "execution.permit");
  const workerPath = resolve(binRoot, `worker-${sequence}.mjs`);
  const nodePath = resolve(dirname(workerPath), `node-${sequence}`);
  await copySealed(workerBytes, workerPath, envelope.worker.sha256, true);
  await copySealed(nodeBytes, nodePath, nodeIdentity, true);
  if (faultInjection === "private-worker-substitution" && sequence === 0) {
    await chmod(workerPath, 0o700);
    await writeFile(workerPath, "substituted-private-worker");
    await chmod(workerPath, 0o500);
  }
  const profile = sandboxProfile(workspaceRoot, nodePath);
  const adapterArgv = Object.freeze(["-p", profile, nodePath, workerPath, requestPath]);
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
    workerSha256: envelope.worker.sha256,
    probeSha256: phase === "isolation.probe" ? envelope.worker.sha256 : null,
    argv: Object.freeze(phase === "isolation.probe"
      ? ["probe"]
      : phase === "composition.import"
        ? ["import", "consumer.mjs"]
        : ["--test", "test/greeting.test.mjs"]),
    adapterId: envelope.adapter.adapterId,
    adapterPath,
    adapterSha256: envelope.adapter.executableSha256,
    adapterCdHashSha256: envelope.adapter.cdHashSha256,
    adapterArgv,
    policyId: envelope.denialPolicy.policyId,
    policyContractSha256: envelope.denialPolicy.policySha256,
    concretePolicySha256: digest(Buffer.from(profile)),
    hostEvidenceDigest: hostProof.digest,
    executionPermitPath: permitPath,
    timeoutMs: 30_000,
    maxOutputBytes: 262_144
  });
  await writeFile(requestPath, JSON.stringify(request), { mode: 0o600, flag: "wx" });
  try {
    const preSpawnProof = await adapterVerifier(invocationId);
    if (!hostEvidenceStable(hostProof, preSpawnProof)) throw new Error("host_evidence_changed");
    await verifySealedPrivateCopy(workerPath, envelope.worker.sha256, true);
    await verifySealedPrivateCopy(nodePath, nodeIdentity, true);
  } catch {
    await rm(requestPath, { force: true });
    await rm(workerPath, { force: true });
    await rm(nodePath, { force: true });
    return Object.freeze({ state: "blocked", reason: "isolation_not_observable", phase, reaped: true });
  }
  const child = spawn(adapterPath, adapterArgv, {
    cwd: workspaceRoot,
    env: Object.freeze({ PATH: "", HOME: workspaceRoot, TMPDIR: workspaceRoot }),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const killGroup = () => killProcessGroup(child);
  let stdout = "";
  let stderr = "";
  let interrupted = false;
  let permitPromise = null;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (stdout.length > 262_144) killGroup();
    if (permitPromise === null && stdout.includes('"checkpoint":"worker.started"')) {
      interrupted = interruptAfterPhase === phase;
      permitPromise = rm(nodePath, { force: true }).then(async () => {
        if (interrupted) {
          killGroup();
        } else {
          await writeFile(permitPath, invocationId, { mode: 0o400, flag: "wx" });
        }
      }).catch(() => {
        killGroup();
        return "failed";
      });
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
    if (stderr.length > 262_144) killGroup();
  });
  const exit = await new Promise((resolveExit) => {
    const timer = setTimeout(killGroup, 35_000);
    child.once("error", (error) => {
      clearTimeout(timer);
      resolveExit({ error });
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolveExit({ code, signal });
    });
  });
  const permitResult = permitPromise === null ? "missing" : await permitPromise;
  const actuallyQuiescent = await reapProcessGroup(child);
  const groupQuiescent = faultInjection === "reap-evidence-uncertain" ? false : actuallyQuiescent;
  if (!groupQuiescent) {
    return Object.freeze({ state: "blocked", reason: "worker_descendants_not_quiescent", phase, reaped: false });
  }
  await rm(requestPath, { force: true });
  await rm(permitPath, { force: true });
  await rm(nodePath, { force: true });
  await rm(workerPath, { force: true });
  try {
    const afterProof = await adapterVerifier(invocationId);
    if (!hostEvidenceStable(hostProof, afterProof)) throw new Error("host_evidence_changed");
  } catch {
    return Object.freeze({ state: "blocked", reason: "isolation_not_observable", phase, reaped: true });
  }
  if (permitResult === "failed") return Object.freeze({ state: "blocked", reason: "worker_execution_uncertain", phase, reaped: true });
  if (interrupted) return Object.freeze({ state: "blocked", reason: "worker_interrupted", phase, reaped: true });
  if (exit.error || exit.code !== 0 || exit.signal !== null) {
    return Object.freeze({ state: "blocked", reason: "worker_execution_uncertain", phase, reaped: true });
  }
  const lines = stdout.trim().split("\n").filter(Boolean);
  if (lines.length !== 2) return Object.freeze({ state: "blocked", reason: "worker_receipt_malformed", phase, reaped: true });
  let checkpoint;
  let terminal;
  try {
    checkpoint = JSON.parse(lines[0]);
    terminal = JSON.parse(lines[1]);
  } catch {
    return Object.freeze({ state: "blocked", reason: "worker_receipt_malformed", phase, reaped: true });
  }
  if (!closedDataObject(checkpoint, ["checkpoint", "invocationId"]) || checkpoint.checkpoint !== "worker.started" ||
      checkpoint.invocationId !== invocationId) {
    return Object.freeze({ state: "blocked", reason: "worker_receipt_malformed", phase, reaped: true });
  }
  const receipt = terminal?.receipt;
  if (!validateIsolationReceipt(terminal, request)) {
    return Object.freeze({ state: "blocked", reason: "worker_receipt_mismatch", phase, reaped: true });
  }
  const targetAfter = await phaseFileIdentity(workspaceRoot, "src/greeting.mjs");
  const testAfter = await phaseFileIdentity(workspaceRoot, "test/greeting.test.mjs");
  if (JSON.stringify(targetAfter) !== JSON.stringify(target) || JSON.stringify(testAfter) !== JSON.stringify(test)) {
    return Object.freeze({ state: "blocked", reason: "worker_workspace_mutated", phase, reaped: true });
  }
  return Object.freeze({ state: "terminal", phase, outcome: receipt.outcome, invocationId, reaped: true });
}

async function runCompositionInstall({
  adapterPath, workspaceRoot, npmCliPath, npmCliSha256, artifactSha256,
  envelope, nodeIdentity, nodeBytes, binRoot, baseRevision, headRevision, nonce,
  interruptAfterPhase, adapterVerifier
}) {
  const phase = "composition.install";
  const invocationId = digest(Buffer.from(`${nonce}:install:${phase}`));
  const hostProof = await adapterVerifier(invocationId);
  const npmArgs = Object.freeze([
    npmCliPath, "install", "--save-dev", "--save-exact", "shield-team-system.tgz",
    "--ignore-scripts", "--no-audit", "--no-fund", "--package-lock=false", "--offline",
    "--cache", resolve(workspaceRoot, ".npm-cache")
  ]);
  const nodePath = resolve(binRoot, "node-install");
  await copySealed(nodeBytes, nodePath, nodeIdentity, true);
  const profile = sandboxProfile(workspaceRoot, nodePath);
  const adapterArgv = Object.freeze(["-p", profile, nodePath, ...npmArgs]);
  const request = Object.freeze({
    schemaVersion: "shield.fixture.composition-install-request.v1",
    invocationId, workspaceRoot, baseRevision, headRevision, phase,
    artifactSha256, executableSha256: nodeIdentity, npmCliPath, npmCliSha256,
    adapterId: envelope.adapter.adapterId, adapterPath,
    adapterSha256: envelope.adapter.executableSha256,
    adapterCdHashSha256: envelope.adapter.cdHashSha256,
    adapterArgv, policyId: envelope.denialPolicy.policyId,
    policyContractSha256: envelope.denialPolicy.policySha256,
    concretePolicySha256: digest(Buffer.from(profile)),
    hostEvidenceDigest: hostProof.digest, timeoutMs: 60_000, maxOutputBytes: 262_144
  });
  try {
    const preSpawnProof = await adapterVerifier(invocationId);
    if (!hostEvidenceStable(hostProof, preSpawnProof)) throw new Error("composition_install_preflight_changed");
    await verifySealedPrivateCopy(nodePath, nodeIdentity, true);
  } catch {
    await rm(nodePath, { force: true });
    return Object.freeze({ state: "blocked", reason: "composition_install_uncertain", reaped: true });
  }
  const child = spawn(adapterPath, adapterArgv, {
    cwd: workspaceRoot,
    env: Object.freeze({ PATH: "", HOME: workspaceRoot, TMPDIR: workspaceRoot }),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = Buffer.alloc(0);
  const chunks = [];
  const collect = (chunk) => {
    chunks.push(chunk);
    output = Buffer.concat(chunks);
    if (output.length > request.maxOutputBytes) {
      try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
    }
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  let interrupted = false;
  child.once("spawn", () => {
    if (interruptAfterPhase === phase) {
      interrupted = true;
      killProcessGroup(child);
    }
  });
  const exit = await new Promise((done) => {
    const timer = setTimeout(() => {
      killProcessGroup(child);
    }, request.timeoutMs);
    child.once("error", (error) => { clearTimeout(timer); done({ error }); });
    child.once("close", (code, signal) => { clearTimeout(timer); done({ code, signal }); });
  });
  const groupQuiescent = await reapProcessGroup(child);
  if (!groupQuiescent) {
    return Object.freeze({ state: "blocked", reason: "composition_install_descendants_not_quiescent", reaped: false });
  }
  await rm(nodePath, { force: true });
  let afterProof;
  try {
    afterProof = await adapterVerifier(invocationId);
  } catch {
    return Object.freeze({ state: "blocked", reason: "composition_install_uncertain", reaped: true });
  }
  if (!hostEvidenceStable(hostProof, afterProof) || exit.error || (!interrupted && exit.signal !== null)) {
    return Object.freeze({ state: "blocked", reason: "composition_install_uncertain", reaped: true });
  }
  if (interrupted) return Object.freeze({ state: "blocked", reason: "composition_install_interrupted", phase, reaped: true });
  const receipt = Object.freeze({
    ...request,
    schemaVersion: "shield.fixture.composition-install-receipt.v1",
    outcome: exit.code === 0 ? "passed" : "failed",
    outputSha256: digest(output)
  });
  if (!closedDataObject(receipt, [...Reflect.ownKeys(request), "outcome", "outputSha256"])) {
    return Object.freeze({ state: "blocked", reason: "composition_install_receipt_malformed" });
  }
  return Object.freeze({ state: "terminal", outcome: receipt.outcome, receipt, reaped: true });
}

const COMPOSITION_HOST_FIELDS = Object.freeze([
  "baselinePath", "isolationEnvelopePath", "interruptAfterPhase", "faultInjection"
]);
const COMPOSITION_CONSUMER = [
  'await import("@shield/team-system/config");',
  'await import("@shield/team-system/supervision");',
  'await import("@shield/team-system/adapter");',
  ""
].join("\n");

export async function composeExternalArtifact({
  fixtureRoot, packageArtifactPath, baseRevision, headRevision, hostContext
}) {
  if (typeof fixtureRoot !== "string" || typeof packageArtifactPath !== "string" ||
      !REVISION.test(baseRevision) || !REVISION.test(headRevision) || baseRevision.length !== headRevision.length ||
      !closedDataObject(hostContext, COMPOSITION_HOST_FIELDS) || typeof hostContext.baselinePath !== "string" ||
      typeof hostContext.isolationEnvelopePath !== "string" ||
      !(hostContext.interruptAfterPhase === null ||
        ["isolation.probe", "composition.install", "composition.import"].includes(hostContext.interruptAfterPhase)) ||
      !(hostContext.faultInjection === null || ISOLATION_FAULTS.includes(hostContext.faultInjection))) {
    return Object.freeze({ state: "invalid", reason: "fixture_composition_input_not_closed" });
  }
  const benchmarkRoot = await realpath(resolve(fixtureRoot)).catch(() => null);
  if (benchmarkRoot === null) return Object.freeze({ state: "blocked", reason: "fixture_root_not_regular" });
  let supervisorRoot = null;
  let supervisorRootIdentity = null;
  let adapterSource = null;
  let cleanupSafe = true;
  try {
    const baseline = await readExternalJson(resolve(hostContext.baselinePath), benchmarkRoot);
    const launcherBytes = await readFile(fileURLToPath(import.meta.url));
    if (baseline.launcherDigest !== digest(launcherBytes)) return Object.freeze({ state: "blocked", reason: "launcher_digest_mismatch" });
    const verifierPath = resolve(benchmarkRoot, "verify-fixture-identity.mjs");
    if (baseline.verifierDigest !== digest(await readFile(verifierPath))) return Object.freeze({ state: "blocked", reason: "verifier_digest_mismatch" });
    const verifier = await import(pathToFileURL(verifierPath).href);
    const identity = await verifier.verifyFixtureIdentity(benchmarkRoot, baseline);
    if (identity.state !== "valid") return identity;
    const envelope = await loadTrustedIsolationEnvelope({
      envelopePath: hostContext.isolationEnvelopePath,
      fixtureRoot: benchmarkRoot
    });
    adapterSource = await openTrustedAdapter(envelope);
    const workerSource = await loadTrustedWorkerSource(WORKER_SOURCE, envelope.worker.sha256);
    const nodeSource = await readNoFollow(process.execPath);
    const npmCliPath = resolve(dirname(process.execPath), "../lib/node_modules/npm/bin/npm-cli.js");
    const npmCli = await readNoFollow(npmCliPath);
    const artifactResolved = await regularExternalFile(resolve(packageArtifactPath), benchmarkRoot);
    if (artifactResolved === null) return Object.freeze({ state: "blocked", reason: "package_artifact_not_regular" });
    const artifact = await readNoFollow(artifactResolved);
    supervisorRoot = await realpath(await mkdtemp(join(tmpdir(), "shield-v03-composition-")));
    await chmod(supervisorRoot, 0o700);
    supervisorRootIdentity = await captureDisposableRoot(supervisorRoot, "shield-v03-composition-");
    const workspaceRoot = resolve(supervisorRoot, "workspace");
    const binRoot = resolve(supervisorRoot, "bin");
    await mkdir(resolve(workspaceRoot, "src"), { recursive: true, mode: 0o700 });
    await mkdir(resolve(workspaceRoot, "test"), { recursive: true, mode: 0o700 });
    await mkdir(binRoot, { mode: 0o700 });
    await writeFile(resolve(workspaceRoot, "src/greeting.mjs"), "export const greeting = () => 'composition';\n");
    await writeFile(resolve(workspaceRoot, "test/greeting.test.mjs"), "export {};\n");
    await writeFile(resolve(workspaceRoot, "package.json"), '{"private":true,"type":"module"}\n');
    await writeFile(resolve(workspaceRoot, "shield-team-system.tgz"), artifact.bytes, { flag: "wx", mode: 0o400 });
    await writeFile(resolve(workspaceRoot, "consumer.mjs"), COMPOSITION_CONSUMER, { flag: "wx", mode: 0o400 });
    const nonce = digest(Buffer.from(`${Date.now()}:${process.pid}:${supervisorRoot}:composition`));
    const adapterVerifier = createAdapterVerifier(adapterSource, envelope, hostContext.faultInjection);
    const common = {
      adapterPath: SANDBOX_EXECUTABLE, workerBytes: workerSource.bytes, binRoot,
      workspaceRoot, baseRevision, headRevision, nonce, envelope,
      nodeIdentity: digest(nodeSource.bytes), nodeBytes: nodeSource.bytes,
      interruptAfterPhase: hostContext.interruptAfterPhase, faultInjection: hostContext.faultInjection,
      adapterVerifier
    };
    const probe = await runIsolatedPhase({ ...common, phase: "isolation.probe", sequence: 0 });
    cleanupSafe = probe.reaped !== false;
    if (probe.state !== "terminal") return probe;
    if (probe.outcome !== "passed") return Object.freeze({ state: "blocked", reason: "isolation_not_observable" });
    const install = await runCompositionInstall({
      adapterPath: SANDBOX_EXECUTABLE, workspaceRoot, npmCliPath, npmCliSha256: digest(npmCli.bytes),
      artifactSha256: digest(artifact.bytes), envelope, nodeIdentity: digest(nodeSource.bytes),
      nodeBytes: nodeSource.bytes, binRoot,
      baseRevision, headRevision, nonce, interruptAfterPhase: hostContext.interruptAfterPhase,
      adapterVerifier
    });
    cleanupSafe = install.reaped !== false;
    if (install.state !== "terminal" && install.reason === "composition_install_interrupted") return install;
    if (install.state !== "terminal" || install.outcome !== "passed") {
      return Object.freeze({ state: "blocked", reason: "package_artifact_install_failed" });
    }
    let manifest;
    try {
      manifest = JSON.parse(await readFile(resolve(workspaceRoot, "node_modules/@shield/team-system/package.json"), "utf8"));
    } catch {
      return Object.freeze({ state: "blocked", reason: "installed_package_identity_missing" });
    }
    if (!plain(manifest) || manifest.name !== baseline.package.name || manifest.version !== baseline.package.version) {
      return Object.freeze({ state: "blocked", reason: "installed_package_identity_mismatch" });
    }
    const imported = await runIsolatedPhase({ ...common, phase: "composition.import", sequence: 2 });
    cleanupSafe = imported.reaped !== false;
    if (imported.state !== "terminal") return imported;
    if (imported.state !== "terminal" || imported.outcome !== "passed") {
      return Object.freeze({ state: "blocked", reason: "public_surface_composition_failed" });
    }
    return Object.freeze({
      state: "composed",
      artifactSha256: digest(artifact.bytes),
      installedPackage: Object.freeze({ name: manifest.name, version: manifest.version }),
      phases: Object.freeze(["composition.install", "composition.import"])
    });
  } catch {
    return Object.freeze({ state: "blocked", reason: "composition_isolation_uncertain" });
  } finally {
    if (adapterSource !== null) await adapterSource.handle.close().catch(() => {});
    if (supervisorRoot !== null) {
      if (!cleanupSafe) return Object.freeze({ state: "blocked", reason: "composition_cleanup_unsafe" });
      if (hostContext.faultInjection === "cleanup-failure") {
        return Object.freeze({ state: "blocked", reason: "composition_cleanup_failed" });
      }
      const cleaned = supervisorRootIdentity !== null && await removeDisposableRoot(supervisorRootIdentity);
      if (!cleaned) return Object.freeze({ state: "blocked", reason: "composition_cleanup_failed" });
    }
  }
}

export async function gradeExternalFixture({
  fixtureRoot, operatorRepositoryRoot, baseRevision, headRevision, hostContext
}) {
  if (typeof fixtureRoot !== "string" || typeof operatorRepositoryRoot !== "string" ||
      !REVISION.test(baseRevision) || !REVISION.test(headRevision) || baseRevision.length !== headRevision.length ||
      !closedDataObject(hostContext, GRADING_HOST_FIELDS) || typeof hostContext.baselinePath !== "string" ||
      typeof hostContext.isolationEnvelopePath !== "string" ||
      !(hostContext.interruptAfterPhase === null ||
        ["isolation.probe", "grade.candidate", "grade.injected", "grade.restored"].includes(hostContext.interruptAfterPhase))) {
    return Object.freeze({ state: "invalid", reason: "fixture_grading_input_not_closed" });
  }
  if (!(hostContext.failAfterCheckpoint === null || HOST_CHECKPOINTS.includes(hostContext.failAfterCheckpoint))) {
    return Object.freeze({ state: "invalid", reason: "fixture_grading_input_not_closed" });
  }
  if (!(hostContext.faultInjection === null || ISOLATION_FAULTS.includes(hostContext.faultInjection))) {
    return Object.freeze({ state: "invalid", reason: "fixture_grading_input_not_closed" });
  }
  const checkpointFailure = (checkpoint) => hostContext.failAfterCheckpoint === checkpoint
    ? Object.freeze({ state: "blocked", reason: "host_checkpoint_interrupted", checkpoint })
    : null;
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
  let supervisorRootIdentity = null;
  let adapterSource = null;
  let cleanupSafe = true;
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
    const workerSource = await loadTrustedWorkerSource(WORKER_SOURCE, envelope.worker.sha256).catch(() => null);
    const nodeSource = await readNoFollow(process.execPath).catch(() => null);
    if (adapterSource === null || workerSource === null || nodeSource === null ||
        digest(adapterSource.bytes) !== envelope.adapter.executableSha256) {
      return Object.freeze({ state: "blocked", reason: "isolation_capability_identity_mismatch" });
    }

    supervisorRoot = await mkdtemp(join(tmpdir(), "shield-v03-supervisor-"));
    supervisorRoot = await realpath(supervisorRoot);
    await chmod(supervisorRoot, 0o700);
    supervisorRootIdentity = await captureDisposableRoot(supervisorRoot, "shield-v03-supervisor-");
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
    if (checkpointFailure("workspace.prepared")) return checkpointFailure("workspace.prepared");
    const adapterPath = SANDBOX_EXECUTABLE;
    const nonce = digest(Buffer.from(`${Date.now()}:${process.pid}:${supervisorRoot}`));
    const adapterVerifier = createAdapterVerifier(adapterSource, envelope, hostContext.faultInjection);
    const common = { adapterPath, workerBytes: workerSource.bytes, binRoot,
      workspaceRoot, baseRevision, headRevision, nonce, envelope,
      nodeIdentity: digest(nodeSource.bytes), nodeBytes: nodeSource.bytes,
      interruptAfterPhase: hostContext.interruptAfterPhase, faultInjection: hostContext.faultInjection,
      adapterVerifier };
    const probe = await runIsolatedPhase({ ...common, phase: "isolation.probe", sequence: 0 });
    cleanupSafe = probe.reaped !== false;
    if (probe.state !== "terminal") return probe;
    if (probe.outcome !== "passed") {
      return Object.freeze({ state: "blocked", reason: "isolation_not_observable" });
    }
    const candidate = await runIsolatedPhase({ ...common, phase: "grade.candidate", sequence: 1 });
    cleanupSafe = candidate.reaped !== false;
    if (candidate.state !== "terminal") { result = candidate; return result; }
    if (candidate.outcome !== "passed") return Object.freeze({ state: "blocked", reason: "candidate_test_not_passed" });
    if (checkpointFailure("candidate.passed")) return checkpointFailure("candidate.passed");
    const candidateBytes = await readFile(resolve(workspaceRoot, "src/greeting.mjs"));
    const defectBytes = await readFile(resolve(benchmarkRoot, "template/src/greeting.mjs"));
    await writeFile(resolve(workspaceRoot, "src/greeting.mjs"), defectBytes);
    if (checkpointFailure("defect.injected")) return checkpointFailure("defect.injected");
    const injected = await runIsolatedPhase({ ...common, phase: "grade.injected", sequence: 2 });
    cleanupSafe = injected.reaped !== false;
    if (injected.state !== "terminal") { result = injected; return result; }
    if (injected.outcome !== "failed") return Object.freeze({ state: "blocked", reason: "failure_injection_not_observed" });
    if (checkpointFailure("injected.failed")) return checkpointFailure("injected.failed");
    await writeFile(resolve(workspaceRoot, "src/greeting.mjs"), candidateBytes);
    if (checkpointFailure("candidate.restored")) return checkpointFailure("candidate.restored");
    const restored = await runIsolatedPhase({ ...common, phase: "grade.restored", sequence: 3 });
    cleanupSafe = restored.reaped !== false;
    if (restored.state !== "terminal") { result = restored; return result; }
    if (restored.outcome !== "passed" || digest(await readFile(resolve(workspaceRoot, "src/greeting.mjs"))) !== digest(candidateBytes)) {
      return Object.freeze({ state: "blocked", reason: "rollback_mismatch" });
    }
    if (checkpointFailure("restored.passed")) return checkpointFailure("restored.passed");
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
      if (!cleanupSafe) {
        cleanup = false;
      } else if (hostContext.faultInjection === "cleanup-failure") {
        cleanup = false;
      } else {
        cleanup = supervisorRootIdentity !== null && await removeDisposableRoot(supervisorRootIdentity);
      }
    }
    let integrity = false;
    try {
      integrity = snapshotsEqual(before, await checkoutSnapshot(operatorRoot));
    } catch {
      integrity = false;
    }
    if (!cleanup || !integrity) return Object.freeze({
      state: "blocked",
      reason: !cleanup ? (cleanupSafe ? "disposable_cleanup_failed" : "disposable_cleanup_unsafe") : "operator_integrity_mismatch"
    });
    if (checkpointFailure("workspace.removed")) return checkpointFailure("workspace.removed");
    if (checkpointFailure("operator.reverified")) return checkpointFailure("operator.reverified");
  }
  return result;
}
