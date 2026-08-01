import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, resolve } from "node:path";
import { run } from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const HEX64 = /^[0-9a-f]{64}$/u;
const REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const ID = /^[a-z0-9](?:[a-z0-9._-]{0,63})$/u;
const PHASES = Object.freeze(["isolation.probe", "composition.import", "grade.candidate", "grade.injected", "grade.restored"]);
const FIELDS = Object.freeze([
  "schemaVersion", "invocationId", "workspaceRoot", "baseRevision", "headRevision",
  "phase", "targetSha256", "targetMode", "testSha256", "testMode", "executableSha256",
  "workerSha256", "probeSha256", "argv", "adapterId", "adapterPath", "adapterSha256",
  "adapterCdHashSha256", "adapterArgv", "policyId", "policyContractSha256",
  "concretePolicySha256", "hostEvidenceDigest", "executionPermitPath", "timeoutMs", "maxOutputBytes"
]);
const RECEIPT_FIELDS = Object.freeze([...FIELDS, "outcome", "outputSha256"]);

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

async function testOutcome(root) {
  const stream = run({ files: [resolve(root, "test/greeting.test.mjs")], isolation: "none" });
  let failed = 0;
  let passed = 0;
  let output = "";
  stream.on("test:pass", () => { passed += 1; });
  stream.on("test:fail", (event) => { failed += 1; output += `${event.name}\n`; });
  await new Promise((done, reject) => {
    stream.once("error", reject);
    stream.once("end", done);
    stream.resume();
  });
  return Object.freeze({ outcome: failed === 0 && passed > 0 ? "passed" : "failed", output: Buffer.from(output) });
}

async function main() {
  if (process.argv.length !== 3) throw new Error("worker_argv_not_closed");
  const requestPath = resolve(process.argv[2]);
  const request = JSON.parse(await readFile(requestPath, "utf8"));
  if (!dataObject(request, FIELDS) || request.schemaVersion !== "shield.fixture.isolation-request.v1" ||
      !HEX64.test(request.invocationId) || !REVISION.test(request.baseRevision) ||
      !REVISION.test(request.headRevision) || request.baseRevision.length !== request.headRevision.length || !PHASES.includes(request.phase) ||
      !HEX64.test(request.targetSha256) || !HEX64.test(request.testSha256) || !HEX64.test(request.executableSha256) ||
      !HEX64.test(request.workerSha256) ||
      !(request.phase === "isolation.probe"
        ? request.probeSha256 === request.workerSha256
        : request.probeSha256 === null) ||
      !Number.isInteger(request.targetMode) || !Number.isInteger(request.testMode) ||
      !Array.isArray(request.argv) ||
      !(request.phase === "isolation.probe"
        ? request.argv.length === 1 && request.argv[0] === "probe"
        : request.phase === "composition.import"
          ? request.argv.length === 2 && request.argv[0] === "import" && request.argv[1] === "consumer.mjs"
        : request.argv.length === 2 && request.argv[0] === "--test" && request.argv[1] === "test/greeting.test.mjs") ||
      !ID.test(request.adapterId) || !ID.test(request.policyId) ||
      request.adapterPath !== "/usr/bin/sandbox-exec" || !HEX64.test(request.adapterSha256) ||
      !HEX64.test(request.adapterCdHashSha256) || !Array.isArray(request.adapterArgv) || request.adapterArgv.length !== 5 ||
      request.adapterArgv[0] !== "-p" || request.adapterArgv[2] !== process.execPath ||
      resolve(request.adapterArgv[3]) !== resolve(process.argv[1]) || request.adapterArgv[4] !== requestPath ||
      request.adapterArgv.some((entry) => typeof entry !== "string") ||
      sha256(Buffer.from(request.adapterArgv[1])) !== request.concretePolicySha256 ||
      !HEX64.test(request.policyContractSha256) || !HEX64.test(request.concretePolicySha256) ||
      !HEX64.test(request.hostEvidenceDigest) ||
      request.executionPermitPath !== resolve(request.workspaceRoot, "execution.permit") ||
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
  const worker = await fileIdentity(resolve(process.argv[1]));
  if (target.sha256 !== request.targetSha256 || target.mode !== request.targetMode ||
      test.sha256 !== request.testSha256 || test.mode !== request.testMode ||
      executable.sha256 !== request.executableSha256 || worker.sha256 !== request.workerSha256) {
    throw new Error("worker_identity_mismatch");
  }

  process.stdout.write(`${JSON.stringify({ checkpoint: "worker.started", invocationId: request.invocationId })}\n`);
  const permitDeadline = Date.now() + 5_000;
  while (true) {
    const permit = await readFile(request.executionPermitPath, "utf8").catch(() => null);
    if (permit === request.invocationId) break;
    if (Date.now() >= permitDeadline) throw new Error("worker_execution_permit_missing");
    await new Promise((done) => setTimeout(done, 5));
  }
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
    } catch {
      childDenied = true;
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
  } else if (request.phase === "composition.import") {
    try {
      await import(new URL(`file://${resolve(root, request.argv[1])}`).href);
      outcome = "passed";
    } catch (error) {
      outcome = "failed";
      output = Buffer.from(error instanceof Error ? error.message : "composition_import_failed");
    }
  } else {
    try {
      ({ outcome, output } = await testOutcome(root));
    } catch {
      outcome = "unavailable";
    }
  }
  const receipt = Object.freeze({
    ...request,
    schemaVersion: "shield.fixture.isolation-receipt.v1",
    outcome,
    outputSha256: sha256(output)
  });
  if (!dataObject(receipt, RECEIPT_FIELDS)) throw new Error("worker_receipt_malformed");
  process.stdout.write(`${JSON.stringify({ receipt })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "worker_failed"}\n`);
  process.exitCode = 1;
});
