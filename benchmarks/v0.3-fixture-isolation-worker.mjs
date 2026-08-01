import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HEX64 = /^[0-9a-f]{64}$/u;
const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const ID = /^[a-z0-9](?:[a-z0-9._-]{0,63})$/u;
const PHASES = Object.freeze(["isolation.probe", "grade.candidate", "grade.injected", "grade.restored"]);
const FIELDS = Object.freeze([
  "schemaVersion", "invocationId", "workspaceRoot", "baseRevision", "headRevision",
  "phase", "targetSha256", "targetMode", "testSha256", "testMode", "executableSha256",
  "argv", "adapterId", "policyId", "hostEvidenceDigest", "timeoutMs", "maxOutputBytes"
]);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function dataObject(value, fields) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== fields.length) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return fields.every((field) => Object.hasOwn(descriptors, field) &&
    Object.hasOwn(descriptors[field], "value") && descriptors[field].enumerable);
}

async function fileIdentity(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("worker_file_not_regular");
  return Object.freeze({ sha256: sha256(await readFile(path)), mode: info.mode & 0o777 });
}

async function main() {
  if (process.argv.length !== 3) throw new Error("worker_argv_not_closed");
  const requestPath = resolve(process.argv[2]);
  const request = JSON.parse(await readFile(requestPath, "utf8"));
  if (!dataObject(request, FIELDS) || request.schemaVersion !== "shield.fixture.isolation-request.v1" ||
      !HEX64.test(request.invocationId) || !REVISION.test(request.baseRevision) ||
      !REVISION.test(request.headRevision) || request.baseRevision.length !== request.headRevision.length || !PHASES.includes(request.phase) ||
      !HEX64.test(request.targetSha256) || !HEX64.test(request.testSha256) || !HEX64.test(request.executableSha256) ||
      !Number.isInteger(request.targetMode) || !Number.isInteger(request.testMode) ||
      !Array.isArray(request.argv) ||
      !(request.phase === "isolation.probe"
        ? request.argv.length === 1 && request.argv[0] === "probe"
        : request.argv.length === 2 && request.argv[0] === "--test" && request.argv[1] === "test/greeting.test.mjs") ||
      !ID.test(request.adapterId) || !ID.test(request.policyId) ||
      !HEX64.test(request.hostEvidenceDigest) ||
      !Number.isInteger(request.timeoutMs) || request.timeoutMs < 1 || request.timeoutMs > 30_000 ||
      !Number.isInteger(request.maxOutputBytes) || request.maxOutputBytes < 1 || request.maxOutputBytes > 262_144) {
    throw new Error("worker_request_malformed");
  }
  const root = await realpath(resolve(request.workspaceRoot));
  if (root !== resolve(request.workspaceRoot) || requestPath !== resolve(root, "request.json")) {
    throw new Error("worker_root_mismatch");
  }
  const target = await fileIdentity(resolve(root, "src/greeting.mjs"));
  const test = await fileIdentity(resolve(root, "test/greeting.test.mjs"));
  const executable = await fileIdentity(process.execPath);
  if (target.sha256 !== request.targetSha256 || target.mode !== request.targetMode ||
      test.sha256 !== request.testSha256 || test.mode !== request.testMode ||
      executable.sha256 !== request.executableSha256) throw new Error("worker_identity_mismatch");

  process.stdout.write(`${JSON.stringify({ checkpoint: "worker.started", invocationId: request.invocationId })}\n`);
  let outcome = "unavailable";
  let output = Buffer.alloc(0);
  if (request.phase === "isolation.probe") {
    const insidePath = resolve(root, "probe-inside");
    const outsidePath = resolve(dirname(root), "probe-outside");
    let insideAllowed = false;
    let outsideDenied = false;
    let childDenied = false;
    let networkDenied = false;
    try {
      await writeFile(insidePath, request.invocationId, { flag: "wx" });
      insideAllowed = true;
    } finally {
      await rm(insidePath, { force: true }).catch(() => {});
    }
    try {
      await writeFile(outsidePath, request.invocationId, { flag: "wx" });
      await rm(outsidePath, { force: true }).catch(() => {});
    } catch (error) {
      outsideDenied = error?.code === "EPERM" || error?.code === "EACCES";
    }
    try {
      await execFileAsync("/usr/bin/true", [], { timeout: 1_000, maxBuffer: 1_024 });
    } catch (error) {
      childDenied = error?.code === "EPERM" || error?.code === "EACCES";
    }
    networkDenied = await new Promise((done) => {
      const socket = createConnection({ host: "127.0.0.1", port: 9 });
      const timer = setTimeout(() => { socket.destroy(); done(false); }, 1_000);
      socket.once("connect", () => { clearTimeout(timer); socket.destroy(); done(false); });
      socket.once("error", (error) => {
        clearTimeout(timer);
        done(error?.code === "EPERM" || error?.code === "EACCES");
      });
    });
    outcome = insideAllowed && outsideDenied && childDenied && networkDenied ? "passed" : "denied";
    output = Buffer.from(JSON.stringify({ insideAllowed, outsideDenied, childDenied, networkDenied }));
  } else {
  try {
    const result = await execFileAsync(process.execPath, request.argv, {
      cwd: root,
      encoding: "buffer",
      env: Object.freeze({ PATH: "", HOME: root, TMPDIR: root }),
      timeout: request.timeoutMs,
      maxBuffer: request.maxOutputBytes
    });
    output = Buffer.concat([result.stdout ?? Buffer.alloc(0), result.stderr ?? Buffer.alloc(0)]);
    outcome = "passed";
  } catch (error) {
    output = Buffer.concat([
      Buffer.isBuffer(error?.stdout) ? error.stdout : Buffer.alloc(0),
      Buffer.isBuffer(error?.stderr) ? error.stderr : Buffer.alloc(0)
    ]);
    outcome = error?.killed || error?.signal ? "timeout" : Number.isInteger(error?.code) ? "failed" : "unavailable";
  }
  }
  const receipt = Object.freeze({
    schemaVersion: "shield.fixture.isolation-receipt.v1",
    invocationId: request.invocationId,
    workspaceRoot: root,
    baseRevision: request.baseRevision,
    headRevision: request.headRevision,
    phase: request.phase,
    targetSha256: target.sha256,
    targetMode: target.mode,
    testSha256: test.sha256,
    testMode: test.mode,
    executableSha256: executable.sha256,
    argv: request.argv,
    adapterId: request.adapterId,
    policyId: request.policyId,
    hostEvidenceDigest: request.hostEvidenceDigest,
    outcome,
    outputSha256: sha256(output)
  });
  process.stdout.write(`${JSON.stringify({ receipt })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "worker_failed"}\n`);
  process.exitCode = 1;
});
