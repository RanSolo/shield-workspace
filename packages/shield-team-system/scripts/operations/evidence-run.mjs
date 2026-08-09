#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  inspectGit,
  readJsonSnapshot,
  redact,
  releaseReservedOutput,
  retainReservedOutput,
  SHA256_PATTERN,
  sha256,
  snapshotFile,
  stableJson,
  validateAcceptanceSpec,
  writeReservedOutput,
} from './common.mjs';

export const EVIDENCE_TOOL_NAME = 'evidence-run';
export const EVIDENCE_TOOL_VERSION = '2.0.0';
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;
const KILL_GRACE_MS = 250;
const ENVIRONMENT_ALLOWLIST = new Set([
  'COMSPEC', 'LANG', 'LC_ALL', 'LC_CTYPE', 'PATH', 'PATHEXT', 'SYSTEMROOT',
  'TEMP', 'TMP', 'TMPDIR', 'TZ', 'WINDIR',
]);

const parseArguments = (argv) => {
  const options = {};
  while (argv.length > 0) {
    const option = argv.shift();
    if (option === '--spec') options.specPath = argv.shift();
    else if (option === '--expected-spec-sha256') options.expectedSpecSha256 = argv.shift();
    else if (option === '--command-id') options.commandId = argv.shift();
    else if (option === '--output') options.output = argv.shift();
    else throw new Error(`Unknown option: ${option}`);
  }
  if (!options.specPath || !options.expectedSpecSha256 || !options.commandId || !options.output) {
    throw new Error('Usage: evidence-run.mjs --spec FILE --expected-spec-sha256 SHA256 --command-id ID --output RECEIPT.json');
  }
  return options;
};

const capture = (stream) => {
  const chunks = [];
  let capturedBytes = 0;
  let truncated = false;
  stream.on('data', (chunk) => {
    if (capturedBytes >= MAX_CAPTURE_BYTES) {
      truncated = true;
      return;
    }
    const remaining = MAX_CAPTURE_BYTES - capturedBytes;
    const retained = chunk.subarray(0, remaining);
    chunks.push(retained);
    capturedBytes += retained.length;
    if (retained.length < chunk.length) truncated = true;
  });
  return () => ({ bytes: Buffer.concat(chunks), truncated });
};

const sanitizedEnvironment = (source) => Object.fromEntries(
  Object.entries(source).filter(([name, value]) => ENVIRONMENT_ALLOWLIST.has(name) && value !== undefined),
);

const signalChild = (child, signal) => {
  try {
    if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
};

const execute = ({ command, cwd, environment = process.env }) =>
  new Promise((resolvePromise) => {
    let settled = false;
    let timedOut = false;
    let forceTimer;
    let child;
    try {
      child = spawn(command.executable, command.argv, {
        cwd,
        env: sanitizedEnvironment(environment),
        detached: process.platform !== 'win32',
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      resolvePromise({ status: 'spawn-failed', code: null, signal: null, timedOut: false, error, stdout: { bytes: Buffer.alloc(0), truncated: false }, stderr: { bytes: Buffer.alloc(0), truncated: false } });
      return;
    }
    const stdout = capture(child.stdout);
    const stderr = capture(child.stderr);
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      signalChild(child, 'SIGTERM');
      forceTimer = setTimeout(() => signalChild(child, 'SIGKILL'), KILL_GRACE_MS);
    }, command.timeoutMs);
    timeoutTimer.unref();

    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(forceTimer);
      resolvePromise({ status: 'spawn-failed', code: null, signal: null, timedOut, error, stdout: stdout(), stderr: stderr() });
    });
    child.once('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(forceTimer);
      resolvePromise({ status: timedOut ? 'timed-out' : 'completed', code, signal, timedOut, error: null, stdout: stdout(), stderr: stderr() });
    });
  });

const outputRecord = ({ bytes, truncated }) => {
  const text = redact(bytes.toString('utf8'));
  return { text, sha256: sha256(text), truncated };
};

const resolveArtifact = (root, artifactPath) => {
  if (isAbsolute(artifactPath)) throw new Error(`Artifact path must be repository-relative: ${artifactPath}`);
  const absolutePath = resolve(root, artifactPath);
  const fromRoot = relative(root, absolutePath);
  if (fromRoot === '..' || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)) {
    throw new Error(`Artifact path escapes repository root: ${artifactPath}`);
  }
  return absolutePath;
};

const pathIsInside = (root, candidate) => {
  const fromRoot = relative(root, candidate);
  return fromRoot === '' || (fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot));
};

export const runEvidence = async (options, injected = {}) => {
  if (!SHA256_PATTERN.test(options.expectedSpecSha256 ?? '')) throw new Error('Expected spec SHA-256 must be a lowercase digest.');
  const specSnapshot = await readJsonSnapshot(options.specPath, injected.snapshotDependencies);
  if (specSnapshot.sha256 !== options.expectedSpecSha256) {
    throw new Error(`Acceptance spec digest is ${specSnapshot.sha256}; expected ${options.expectedSpecSha256}.`);
  }
  const specErrors = validateAcceptanceSpec(specSnapshot.value);
  if (specErrors.length > 0) throw new Error(`Invalid acceptance spec: ${specErrors.join(' ')}`);
  const spec = specSnapshot.value;
  const command = spec.commands.find((candidate) => candidate.id === options.commandId);
  if (!command) throw new Error(`Command ID is not declared by the acceptance spec: ${options.commandId}`);

  const repositoryRoot = await realpath(spec.repository.root);
  if (repositoryRoot !== spec.repository.root) throw new Error('Acceptance spec repository root is not canonical.');
  const outputReservation = await retainReservedOutput(options.output, injected.writeDependencies);
  const outputPath = outputReservation.absolutePath;
  try {
    if (pathIsInside(repositoryRoot, outputPath)) {
      throw new Error('Evidence receipt output must be outside the measured repository.');
    }
    const gitBefore = inspectGit(repositoryRoot);
  if (!gitBefore || gitBefore.root !== repositoryRoot || gitBefore.branch !== spec.repository.branch) {
    throw new Error('Acceptance spec repository identity does not match the selected worktree.');
  }
  if (!gitBefore.clean) throw new Error('Evidence commands require a clean worktree before execution.');

  const startedAt = new Date();
  const result = await (injected.execute ?? execute)({ command, cwd: repositoryRoot, environment: injected.environment ?? process.env });
  const completedAt = new Date();
  const gitAfter = inspectGit(repositoryRoot);
  const artifacts = [];
  const artifactErrors = [];
  for (const artifactPath of command.artifacts) {
    try {
      const artifact = await snapshotFile(resolveArtifact(repositoryRoot, artifactPath));
      artifacts.push({ path: artifactPath, bytes: artifact.size, sha256: artifact.sha256 });
    } catch (error) {
      artifactErrors.push({ path: artifactPath, error: redact(error instanceof Error ? error.message : String(error)) });
    }
  }

  const toolPath = fileURLToPath(import.meta.url);
  const toolSnapshot = await snapshotFile(toolPath);
  const stdout = outputRecord(result.stdout);
  const stderr = outputRecord(result.stderr);
  const receipt = {
    schemaVersion: 2,
    receiptType: 'mission-command-evidence',
    receiptId: `evidence:${randomUUID()}`,
    evidence: {
      classification: 'advisory-structural-consistency',
      authority: 'none',
      provenance: false,
      executionAttestation: false,
      producerAuthentication: false,
      effectContainment: 'uncertain',
      gateEligible: false,
    },
    specSha256: specSnapshot.sha256,
    commandId: command.id,
    command: { executable: command.executable, argv: [...command.argv] },
    repository: {
      beforeRoot: gitBefore.root,
      beforeBranch: gitBefore.branch,
      beforeHead: gitBefore.head,
      beforeClean: gitBefore.clean,
      afterRoot: gitAfter?.root ?? null,
      afterBranch: gitAfter?.branch ?? null,
      afterHead: gitAfter?.head ?? null,
      afterClean: gitAfter?.clean ?? false,
    },
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    timeoutMs: command.timeoutMs,
    result: {
      status: result.status,
      exitCode: result.code,
      signal: result.signal,
      timedOut: result.timedOut,
      spawnError: result.error ? redact(result.error instanceof Error ? result.error.message : String(result.error)) : null,
      artifactErrors,
    },
    output: { stdout, stderr },
    artifacts,
    tool: {
      name: EVIDENCE_TOOL_NAME,
      version: EVIDENCE_TOOL_VERSION,
      path: toolSnapshot.path,
      sha256: toolSnapshot.sha256,
    },
  };

  await writeReservedOutput(outputReservation, stableJson(receipt));
  if (stdout.text) process.stdout.write(stdout.text);
  if (stderr.text) process.stderr.write(stderr.text);

  const gitStable = gitBefore.root === repositoryRoot && gitAfter?.root === repositoryRoot &&
    gitBefore.root === gitAfter?.root && gitBefore.branch === spec.repository.branch &&
    gitAfter?.branch === spec.repository.branch && gitBefore.branch === gitAfter?.branch &&
    gitBefore.head === gitAfter?.head && gitBefore.clean && gitAfter?.clean === true;
  const exitCode = result.status === 'completed' && result.code === 0 && artifactErrors.length === 0 && gitStable
    ? 0
    : (result.status === 'completed' && Number.isInteger(result.code) && result.code !== 0 ? result.code : 2);
    return { receipt, exitCode, outputPath };
  } finally {
    await releaseReservedOutput(outputReservation);
  }
};

const main = async () => {
  const options = parseArguments(process.argv.slice(2));
  const result = await runEvidence(options);
  console.error(`Evidence receipt: ${result.outputPath}`);
  process.exitCode = result.exitCode;
};

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
