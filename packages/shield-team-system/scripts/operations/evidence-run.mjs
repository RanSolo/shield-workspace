#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  hashFile,
  inspectGit,
  redact,
  sha256,
  stableJson,
  writeNewFile,
} from './common.mjs';

const TOOL_VERSION = '0.1.0-local-prototype';
const MAX_CAPTURE_BYTES = 4 * 1024 * 1024;

const parseArguments = (argv) => {
  const options = { artifacts: [], cwd: process.cwd() };
  const separator = argv.indexOf('--');
  if (separator === -1 || separator === argv.length - 1) {
    throw new Error(
      'Usage: evidence-run.mjs --output RECEIPT.json [--mission-id ID] [--cwd PATH] [--artifact PATH] -- COMMAND [ARG...]',
    );
  }

  const optionArguments = argv.slice(0, separator);
  const command = argv.slice(separator);
  command.shift();

  while (optionArguments.length > 0) {
    const option = optionArguments.shift();
    if (option === '--output') options.output = optionArguments.shift();
    else if (option === '--mission-id') options.missionId = optionArguments.shift();
    else if (option === '--cwd') options.cwd = optionArguments.shift();
    else if (option === '--artifact') options.artifacts.push(optionArguments.shift());
    else if (option === '--label') options.label = optionArguments.shift();
    else throw new Error(`Unknown option: ${option}`);
  }

  if (!options.output) throw new Error('--output is required.');
  if (options.artifacts.some((artifact) => !artifact)) throw new Error('--artifact requires a path.');
  return { ...options, command };
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
  return () => ({ text: Buffer.concat(chunks).toString('utf8'), truncated });
};

const execute = ({ command, cwd }) =>
  new Promise((resolvePromise, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd,
      env: process.env,
      shell: false,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    const stdout = capture(child.stdout);
    const stderr = capture(child.stderr);
    child.once('error', reject);
    child.once('close', (code, signal) => resolvePromise({ code, signal, stdout: stdout(), stderr: stderr() }));
  });

export const runEvidence = async (options) => {
  const cwd = resolve(options.cwd);
  const outputPath = resolve(options.output);
  const startedAt = new Date();
  const gitBefore = inspectGit(cwd);
  const result = await execute({ command: options.command, cwd });
  const completedAt = new Date();
  const gitAfter = inspectGit(cwd);
  const sanitizedStdout = redact(result.stdout.text);
  const sanitizedStderr = redact(result.stderr.text);

  const artifacts = [];
  const artifactErrors = [];
  for (const artifact of options.artifacts) {
    try {
      artifacts.push(await hashFile(resolve(cwd, artifact)));
    } catch (error) {
      artifactErrors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const toolPath = fileURLToPath(import.meta.url);
  const receipt = {
    schemaVersion: 1,
    receiptType: 'local-command-evidence',
    receiptId: `evidence:${randomUUID()}`,
    authority: 'none',
    missionId: options.missionId ?? null,
    label: options.label ?? null,
    command: options.command.map((argument) => redact(argument)),
    cwd,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    durationMs: completedAt.getTime() - startedAt.getTime(),
    result: {
      exitCode: result.code,
      signal: result.signal,
      artifactErrors,
    },
    git: { before: gitBefore, after: gitAfter },
    output: {
      stdout: sanitizedStdout,
      stdoutSha256: sha256(sanitizedStdout),
      stdoutTruncated: result.stdout.truncated,
      stderr: sanitizedStderr,
      stderrSha256: sha256(sanitizedStderr),
      stderrTruncated: result.stderr.truncated,
    },
    artifacts,
    tool: {
      name: 'evidence-run',
      version: TOOL_VERSION,
      path: toolPath,
      sha256: sha256(await readFile(toolPath)),
    },
  };

  await writeNewFile(outputPath, stableJson(receipt));
  if (sanitizedStdout) process.stdout.write(sanitizedStdout);
  if (sanitizedStderr) process.stderr.write(sanitizedStderr);

  const exitCode = artifactErrors.length > 0 && result.code === 0 ? 2 : (result.code ?? 1);
  return { receipt, exitCode, outputPath };
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
