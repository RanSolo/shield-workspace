import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, realpath, rename, stat, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { createAuditedExecutor, createPermissionAuthorizer } from "../../dist/permission-v1.mjs";
import { validateRunnerCyclePlan } from "../../dist/runner-v1.mjs";
import { isSensitiveRepositoryPath } from "./repository-sensitive-policy.mjs";
import { validateRepositoryRelativePath } from "./repository-tools.mjs";
import { strictParseJson } from "./strict-json.mjs";

export const MAY_EXECUTOR_LIMITS = Object.freeze({
  argumentBytes: 524_288,
  contentBytes: 262_144,
  currentFileBytes: 1_048_576,
  commandArguments: 32,
  commandArgumentBytes: 4_096,
  commandOutputBytes: 262_144,
  commandTimeoutMs: 120_000,
});

export const MAY_TOOL_MAPPINGS = Object.freeze({
  writeFile: Object.freeze({
    actionId: "repository.write_file",
    effectClass: "behavioral_implementation",
    capability: "filesystem_write",
  }),
  runValidation: Object.freeze({
    actionId: "repository.run_validation",
    effectClass: "verification",
    capability: "process_execute",
  }),
});

export const MAY_TOOL_DEFINITIONS = Object.freeze([
  Object.freeze({
    type: "function",
    function: Object.freeze({
      name: "writeFile",
      description: "Replace one host-approved UTF-8 repository file at the bound revision and expected digest.",
      parameters: Object.freeze({
        type: "object",
        properties: Object.freeze({
          path: Object.freeze({ type: "string" }),
          content: Object.freeze({ type: "string" }),
          expectedSha256: Object.freeze({ type: "string", description: "Current lowercase SHA-256 or the literal absent." }),
        }),
        required: Object.freeze(["path", "content", "expectedSha256"]),
        additionalProperties: false,
      }),
    }),
  }),
  Object.freeze({
    type: "function",
    function: Object.freeze({
      name: "runValidation",
      description: "Run one exact host-approved validation command by ID without a shell.",
      parameters: Object.freeze({
        type: "object",
        properties: Object.freeze({ commandId: Object.freeze({ type: "string" }) }),
        required: Object.freeze(["commandId"]),
        additionalProperties: false,
      }),
    }),
  }),
]);

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const REVISION = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exactPlain(value, fields) {
  if (!plain(value)) return false;
  const expected = new Set(fields);
  for (const field of fields) if (!Object.hasOwn(value, field)) return false;
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(value, key) : null;
    if (typeof key !== "string" || !expected.has(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return false;
  }
  return true;
}

function data(value, field) {
  const descriptor = Object.getOwnPropertyDescriptor(value, field);
  return descriptor?.enumerable === true && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function denseArray(value) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const output = [];
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(value, key) : null;
    if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(key) || !descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return null;
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return null;
    output.push(Object.getOwnPropertyDescriptor(value, String(index)).value);
  }
  return output;
}

function rootIdentity(info) {
  return `${info.dev}:${info.ino}`;
}

function executableIdentity(info) {
  return `${info.dev}:${info.ino}:${info.mode}:${info.size}:${info.mtimeMs}`;
}

function validUtf8String(value) {
  if (typeof value !== "string") return false;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0) return false;
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}

function safeArgument(value) {
  return typeof value === "string" && Buffer.byteLength(value, "utf8") <= MAY_EXECUTOR_LIMITS.commandArgumentBytes && !/[\u0000-\u001f\u007f]/u.test(value);
}

function executorError(code, outcome = "failed") {
  const error = new Error(code);
  error.executorOutcome = outcome;
  return error;
}

function mayEffectKey(request, args, commands) {
  let descriptor;
  if (request.toolName === "writeFile") {
    descriptor = {
      contentSha256: createHash("sha256").update(Buffer.from(args.content, "utf8")).digest("hex"),
      expectedSha256: args.expectedSha256,
      path: args.path,
      toolName: request.toolName,
    };
  } else {
    const command = commands.get(args.commandId);
    if (!command) throw new Error("may_validation_command_not_approved");
    descriptor = {
      args: command.args,
      commandId: command.commandId,
      executable: command.executable,
      executableIdentity: command.executableIdentity,
      timeoutMs: command.timeoutMs,
      toolName: request.toolName,
    };
  }
  return `effect:may:sha256:${createHash("sha256").update(JSON.stringify(descriptor)).digest("hex")}`;
}

function parseArguments(toolName, raw) {
  if (typeof raw !== "string") throw new Error("may_tool_arguments_malformed");
  const parsed = strictParseJson(raw, { maxBytes: MAY_EXECUTOR_LIMITS.argumentBytes, maxDepth: 3, rejectControlCharacters: false });
  if (parsed.state !== "valid" || !plain(parsed.value)) throw new Error(parsed.code ?? "may_tool_arguments_malformed");
  if (toolName === "writeFile") {
    if (!exactPlain(parsed.value, ["path", "content", "expectedSha256"])) throw new Error("may_tool_arguments_malformed");
    const path = data(parsed.value, "path");
    const content = data(parsed.value, "content");
    const expectedSha256 = data(parsed.value, "expectedSha256");
    if (!validateRepositoryRelativePath(path) || isSensitiveRepositoryPath(path) || !validUtf8String(content) || Buffer.byteLength(content, "utf8") > MAY_EXECUTOR_LIMITS.contentBytes || (expectedSha256 !== "absent" && !SHA256.test(expectedSha256))) {
      throw new Error("may_tool_arguments_malformed");
    }
    return Object.freeze({ path, content, expectedSha256 });
  }
  if (toolName === "runValidation") {
    if (!exactPlain(parsed.value, ["commandId"])) throw new Error("may_tool_arguments_malformed");
    const commandId = data(parsed.value, "commandId");
    if (typeof commandId !== "string" || !IDENTIFIER.test(commandId)) throw new Error("may_tool_arguments_malformed");
    return Object.freeze({ commandId });
  }
  throw new Error("may_tool_unknown");
}

function normalizeRequest(value) {
  if (!exactPlain(value, ["sessionId", "toolCallId", "toolName", "arguments", "repositoryRoot", "baseRevision"])) throw new Error("may_tool_request_malformed");
  for (const field of ["sessionId", "toolCallId"] ) if (typeof data(value, field) !== "string" || !IDENTIFIER.test(data(value, field))) throw new Error("may_tool_request_malformed");
  if (!Object.hasOwn(MAY_TOOL_MAPPINGS, data(value, "toolName")) || typeof data(value, "arguments") !== "string" || typeof data(value, "repositoryRoot") !== "string" || !isAbsolute(data(value, "repositoryRoot")) || !REVISION.test(String(data(value, "baseRevision")))) throw new Error("may_tool_request_malformed");
  return Object.freeze({
    sessionId: data(value, "sessionId"), toolCallId: data(value, "toolCallId"), toolName: data(value, "toolName"),
    arguments: data(value, "arguments"), repositoryRoot: data(value, "repositoryRoot"), baseRevision: data(value, "baseRevision"),
  });
}

function normalizeApprovedFiles(value) {
  const files = denseArray(value);
  if (files === null || files.length === 0) throw new Error("may_executor_configuration_malformed");
  const seen = new Set();
  for (const path of files) {
    if (!validateRepositoryRelativePath(path) || isSensitiveRepositoryPath(path) || seen.has(path)) throw new Error("may_executor_configuration_malformed");
    seen.add(path);
  }
  return Object.freeze([...seen].sort());
}

async function normalizeCommands(value) {
  const commands = denseArray(value);
  if (commands === null || commands.length === 0) throw new Error("may_executor_configuration_malformed");
  const output = new Map();
  for (const command of commands) {
    if (!exactPlain(command, ["commandId", "executable", "args", "timeoutMs"])) throw new Error("may_executor_configuration_malformed");
    const commandId = data(command, "commandId");
    const executable = data(command, "executable");
    const args = denseArray(data(command, "args"));
    const timeoutMs = data(command, "timeoutMs");
    if (typeof commandId !== "string" || !IDENTIFIER.test(commandId) || output.has(commandId) || typeof executable !== "string" || !isAbsolute(executable) || args === null || args.length > MAY_EXECUTOR_LIMITS.commandArguments || args.some((arg) => !safeArgument(arg)) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAY_EXECUTOR_LIMITS.commandTimeoutMs) throw new Error("may_executor_configuration_malformed");
    const canonical = await realpath(executable);
    const info = await stat(canonical);
    if (!info.isFile() || (info.mode & 0o111) === 0) throw new Error("may_validation_executable_invalid");
    output.set(commandId, Object.freeze({ commandId, executable: canonical, executableIdentity: executableIdentity(info), args: Object.freeze(args), timeoutMs }));
  }
  return output;
}

function normalizeDependencies(value) {
  if (!plain(value)) throw new Error("may_executor_configuration_malformed");
  const output = {};
  for (const name of ["nextCallSlot", "getAuthorizationContext", "getExecutionContext", "appendIfAbsent", "nextResultRecordId", "now", "readWorkspaceRevision", "readWorkspaceStatus", "nextTemporaryName"]) {
    const item = data(value, name);
    if (typeof item !== "function") throw new Error("may_executor_configuration_malformed");
    output[name] = item;
  }
  for (const name of ["ledgerId", "repositoryId", "reasoningRuntimeId", "toolExecutorId"]) {
    const item = data(value, name);
    if (typeof item !== "string" || !IDENTIFIER.test(item)) throw new Error("may_executor_configuration_malformed");
    output[name] = item;
  }
  output.approvedFiles = normalizeApprovedFiles(data(value, "approvedFiles"));
  output.validationCommands = data(value, "validationCommands");
  const monotonicNow = data(value, "monotonicNow");
  if (monotonicNow !== undefined && typeof monotonicNow !== "function") throw new Error("may_executor_configuration_malformed");
  output.monotonicNow = monotonicNow ?? (() => Date.now());
  return output;
}

async function createRoot(repositoryRoot) {
  const input = resolve(repositoryRoot);
  const canonical = await realpath(input);
  const info = await stat(canonical);
  if (!info.isDirectory()) throw new Error("may_repository_root_invalid");
  return Object.freeze({ input, canonical, identity: rootIdentity(info) });
}

async function verifyRoot(root) {
  try {
    const [canonical, info] = await Promise.all([realpath(root.input), stat(root.input)]);
    return canonical === root.canonical && info.isDirectory() && rootIdentity(info) === root.identity;
  } catch {
    return false;
  }
}

async function verifyRevision(dependencies, root, baseRevision) {
  if (!(await verifyRoot(root))) throw new Error("may_repository_root_changed");
  const revision = await dependencies.readWorkspaceRevision(root.canonical);
  if (revision !== baseRevision) throw new Error("may_workspace_revision_mismatch");
}

async function verifyWorkspaceState(dependencies, root, baseRevision) {
  await verifyRevision(dependencies, root, baseRevision);
  const changed = denseArray(await dependencies.readWorkspaceStatus(root.canonical));
  if (changed === null) throw new Error("may_workspace_status_malformed");
  const seen = new Set();
  for (const path of changed) {
    if (!validateRepositoryRelativePath(path) || isSensitiveRepositoryPath(path) || seen.has(path)) throw new Error("may_workspace_status_malformed");
    if (!dependencies.approvedFiles.includes(path)) throw new Error("may_workspace_scope_mismatch");
    seen.add(path);
  }
  if ([...seen].some((path, index, values) => index > 0 && values[index - 1].localeCompare(path) >= 0)) throw new Error("may_workspace_status_malformed");
  return Object.freeze([...seen]);
}

async function confinedTarget(root, relativePath) {
  const segments = relativePath.split("/");
  let parent = root.canonical;
  for (const segment of segments.slice(0, -1)) {
    parent = join(parent, segment);
    const info = await lstat(parent).catch(() => null);
    if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(info?.isSymbolicLink() ? "may_path_symlink_denied" : "may_parent_directory_unavailable");
  }
  const escaped = relative(root.canonical, parent);
  if (escaped === ".." || escaped.startsWith(`..${sep}`) || isAbsolute(escaped)) throw new Error("may_path_escape_denied");
  const path = join(parent, segments.at(-1));
  const info = await lstat(path).catch(() => null);
  if (info?.isSymbolicLink() || (info !== null && !info.isFile())) throw new Error(info?.isSymbolicLink() ? "may_path_symlink_denied" : "may_regular_file_required");
  return { parent, path, info };
}

async function currentDigest(target) {
  if (target.info === null) return null;
  if (target.info.size > MAY_EXECUTOR_LIMITS.currentFileBytes) throw new Error("may_current_file_too_large");
  const handle = await open(target.path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || rootIdentity(opened) !== rootIdentity(target.info)) throw new Error("may_file_identity_changed");
    const chunks = [];
    let total = 0;
    while (true) {
      const chunk = Buffer.allocUnsafe(16_384);
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > MAY_EXECUTOR_LIMITS.currentFileBytes) throw new Error("may_current_file_too_large");
      chunks.push(chunk.subarray(0, bytesRead));
    }
    const closed = await handle.stat();
    if (rootIdentity(opened) !== rootIdentity(closed)) throw new Error("may_file_identity_changed");
    return createHash("sha256").update(Buffer.concat(chunks)).digest("hex");
  } finally {
    await handle.close().catch(() => {});
  }
}

async function writeApprovedFile(root, request, args, dependencies) {
  if (!dependencies.approvedFiles.includes(args.path)) throw new Error("may_path_not_approved");
  await verifyWorkspaceState(dependencies, root, request.baseRevision);
  const target = await confinedTarget(root, args.path);
  const digest = await currentDigest(target);
  if ((args.expectedSha256 === "absent" && digest !== null) || (args.expectedSha256 !== "absent" && digest !== args.expectedSha256)) throw new Error("may_file_digest_mismatch");
  await verifyWorkspaceState(dependencies, root, request.baseRevision);
  const temporaryName = dependencies.nextTemporaryName(Object.freeze({ sessionId: request.sessionId, toolCallId: request.toolCallId }));
  if (typeof temporaryName !== "string" || !/^\.shield-may-[A-Za-z0-9_-]{8,64}\.tmp$/u.test(temporaryName)) throw new Error("may_temporary_name_invalid");
  const temporaryPath = join(target.parent, temporaryName);
  let handle;
  try {
    handle = await open(temporaryPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), target.info?.mode ?? 0o600);
    const bytes = Buffer.from(args.content, "utf8");
    await handle.writeFile(bytes);
    await handle.chmod(target.info === null ? 0o600 : target.info.mode & 0o777);
    await handle.sync();
    await handle.close();
    handle = null;
    await verifyWorkspaceState(dependencies, root, request.baseRevision);
    const rechecked = await confinedTarget(root, args.path);
    const recheckedDigest = await currentDigest(rechecked);
    if (recheckedDigest !== digest) throw new Error("may_file_identity_changed");
    await rename(temporaryPath, target.path);
    try {
      await verifyWorkspaceState(dependencies, root, request.baseRevision);
    } catch (error) {
      throw executorError(error instanceof Error ? error.message : "may_workspace_scope_mismatch", "uncertain");
    }
    const written = await lstat(target.path);
    if (!written.isFile() || written.isSymbolicLink()) throw executorError("may_file_identity_changed", "uncertain");
    return Object.freeze({ state: "completed", code: "file_written", path: args.path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  } finally {
    await handle?.close().catch(() => {});
    await unlink(temporaryPath).catch(() => {});
  }
}

async function runApprovedValidation(root, request, args, dependencies, commands) {
  const command = commands.get(args.commandId);
  const workspaceBefore = await verifyWorkspaceState(dependencies, root, request.baseRevision);
  const currentExecutable = await stat(command.executable).catch(() => null);
  if (!currentExecutable?.isFile() || executableIdentity(currentExecutable) !== command.executableIdentity) throw new Error("may_validation_executable_changed");
  const startedAt = dependencies.monotonicNow();
  const execution = await new Promise((resolveExecution, rejectExecution) => {
    const child = spawn(command.executable, command.args, {
      cwd: root.canonical,
      env: { LANG: "C", LC_ALL: "C", PATH: dirname(command.executable) },
      detached: process.platform !== "win32",
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    let truncated = false;
    let timedOut = false;
    const terminate = () => {
      try {
        if (process.platform !== "win32" && child.pid !== undefined) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    };
    const collect = (target) => (chunk) => {
      if (truncated) return;
      bytes += chunk.length;
      if (bytes > MAY_EXECUTOR_LIMITS.commandOutputBytes) {
        truncated = true;
        terminate();
      } else target.push(chunk);
    };
    child.stdout.on("data", collect(stdout));
    child.stderr.on("data", collect(stderr));
    child.on("error", () => rejectExecution(new Error("may_validation_launch_failed")));
    const timer = setTimeout(() => { timedOut = true; terminate(); }, command.timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) return rejectExecution(executorError("may_validation_timeout", "uncertain"));
      if (truncated) return rejectExecution(executorError("may_validation_output_too_large", "uncertain"));
      resolveExecution({ code, signal, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
  try {
    const workspaceAfter = await verifyWorkspaceState(dependencies, root, request.baseRevision);
    if (workspaceAfter.length !== workspaceBefore.length || workspaceAfter.some((path, index) => path !== workspaceBefore[index])) {
      throw new Error("may_validation_workspace_changed");
    }
  } catch (error) {
    throw executorError(error instanceof Error ? error.message : "may_workspace_revision_mismatch", "uncertain");
  }
  return Object.freeze({
    state: "completed", code: "validation_completed", commandId: command.commandId,
    exitCode: execution.code, signal: execution.signal, stdout: execution.stdout, stderr: execution.stderr,
    durationMs: Math.max(0, dependencies.monotonicNow() - startedAt),
  });
}

function validateSlot(value, mapping, effectKey) {
  const checked = validateRunnerCyclePlan(value);
  if (checked.state === "invalid") throw new Error("may_authority_slot_malformed");
  const plan = checked.value;
  if (plan.seatId !== "may" || plan.actionId !== mapping.actionId || plan.effectClass !== mapping.effectClass || plan.effectKey !== effectKey) throw new Error("may_authority_slot_mismatch");
  return plan;
}

function validateContextIdentity(context, expected, plan) {
  if (!plain(context)) throw new Error("may_authority_context_malformed");
  const read = (field) => data(context, field);
  if (read("canonicalWritableRoot") !== expected.canonicalRoot || read("repositoryId") !== expected.repositoryId || read("reasoningRuntimeId") !== expected.reasoningRuntimeId || read("toolExecutorId") !== expected.toolExecutorId || read("artifactRevisionId") !== expected.baseRevision) throw new Error("may_authority_context_identity_mismatch");
  const capabilities = denseArray(read("requiredCapabilities"));
  if (capabilities === null || capabilities.length !== 1 || capabilities[0] !== expected.mapping.capability || plan.actionId !== expected.mapping.actionId) throw new Error("may_authority_context_capability_mismatch");
  return context;
}

function runnerResult(plan, outcome, summary, evidenceRefs) {
  return {
    runnerContractVersion: 1, outcome, missionId: plan.missionId, subjectId: plan.subjectId,
    revisionId: plan.revisionId, evaluatedThroughSequence: plan.evaluatedThroughSequence,
    cycleId: plan.cycleId, seatId: plan.seatId, actionId: plan.actionId,
    effectClass: plan.effectClass, effectKey: plan.effectKey, summary, evidenceRefs,
  };
}

export async function runMayToolCall(requestInput, dependenciesInput) {
  const request = normalizeRequest(requestInput);
  const args = parseArguments(request.toolName, request.arguments);
  const mapping = MAY_TOOL_MAPPINGS[request.toolName];
  const dependencies = normalizeDependencies(dependenciesInput);
  const [root, commands] = await Promise.all([createRoot(request.repositoryRoot), normalizeCommands(dependencies.validationCommands)]);
  const effectKey = mayEffectKey(request, args, commands);
  const expected = Object.freeze({
    canonicalRoot: root.canonical, repositoryId: dependencies.repositoryId,
    reasoningRuntimeId: dependencies.reasoningRuntimeId, toolExecutorId: dependencies.toolExecutorId,
    baseRevision: request.baseRevision, mapping,
  });
  await verifyWorkspaceState(dependencies, root, request.baseRevision);
  const plan = validateSlot(await dependencies.nextCallSlot(Object.freeze({
    sessionId: request.sessionId, toolCallId: request.toolCallId, toolName: request.toolName, effectKey, ...mapping,
  })), mapping, effectKey);
  const authorizer = createPermissionAuthorizer({
    ledgerId: dependencies.ledgerId,
    appendIfAbsent: dependencies.appendIfAbsent,
    getContext: async () => validateContextIdentity(await dependencies.getAuthorizationContext(plan), expected, plan),
  });
  const decision = await authorizer(plan);
  if (decision.outcome !== "allow") throw new Error("may_tool_permission_denied");
  let escrow = null;
  let operationError = null;
  let operationOutcome = "failed";
  const auditedExecutor = createAuditedExecutor({
    ledgerId: dependencies.ledgerId,
    appendIfAbsent: dependencies.appendIfAbsent,
    getContext: async () => validateContextIdentity(await dependencies.getExecutionContext(decision), expected, plan),
    nextRecordId: dependencies.nextResultRecordId,
    now: dependencies.now,
    execute: async () => {
      try {
        const result = request.toolName === "writeFile"
          ? await writeApprovedFile(root, request, args, dependencies)
          : await runApprovedValidation(root, request, args, dependencies, commands);
        escrow = result;
        return runnerResult(plan, "completed", request.toolName === "writeFile" ? "Approved revision-bound file write completed." : `Approved validation command completed: ${args.commandId}.`, [`may-executor:${request.sessionId}`]);
      } catch (error) {
        operationError = error instanceof Error && /^[a-z][a-z0-9_]{0,127}$/u.test(error.message) ? error.message : "may_tool_execution_failed";
        operationOutcome = error?.executorOutcome === "uncertain" ? "uncertain" : "failed";
        return runnerResult(plan, operationOutcome, operationOutcome === "uncertain" ? `May executor effect outcome is uncertain (${operationError}); the session must stop.` : `May executor operation failed closed: ${operationError}.`, [`may-executor:${request.sessionId}`]);
      }
    },
  });
  const outcome = await auditedExecutor(plan, decision);
  if (outcome.outcome !== "completed" || escrow === null) {
    escrow = null;
    throw new Error(operationError ?? "may_tool_result_not_releasable");
  }
  return Object.freeze({ ...escrow, attribution: "host_observed_tool_result" });
}
