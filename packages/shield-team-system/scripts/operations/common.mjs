import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

export const git = (cwd, args) =>
  execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

export const tryGit = (cwd, args) => {
  try {
    return git(cwd, args);
  } catch {
    return undefined;
  }
};

export const inspectGit = (cwd) => {
  const root = tryGit(cwd, ['rev-parse', '--show-toplevel']);
  if (!root) return null;
  const branch = tryGit(root, ['branch', '--show-current']);
  const head = git(root, ['rev-parse', 'HEAD']);
  const status = git(root, ['status', '--porcelain=v1']);
  return {
    root,
    branch: branch || null,
    head,
    dirty: status !== '',
    changedPaths: status === '' ? [] : status.split('\n').map((line) => line.slice(3)),
  };
};

export const writeNewFile = async (path, content) => {
  const absolutePath = resolve(path);
  if (existsSync(absolutePath)) throw new Error(`Refusing to overwrite existing file: ${absolutePath}`);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, content, { encoding: 'utf8', flag: 'wx' });
  return absolutePath;
};

export const hashFile = async (path) => {
  const absolutePath = resolve(path);
  const fileStat = await stat(absolutePath).catch(() => undefined);
  if (!fileStat?.isFile()) throw new Error(`Artifact is not a file: ${absolutePath}`);
  const bytes = await readFile(absolutePath);
  return { path: absolutePath, bytes: bytes.length, sha256: sha256(bytes) };
};

const assignmentPattern = /(authorization|passcode|password|secret|token)(\s*[:=]\s*)([^\s,;]+)/giu;
const bearerPattern = /\b(Bearer|Basic)\s+[A-Za-z0-9+/=_-]+/gu;
const knownTokenPattern = /\b(?:gh[opsu]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+|AKIA[A-Z0-9]{16})\b/gu;

export const redact = (value) =>
  String(value)
    .replace(assignmentPattern, '$1$2[REDACTED]')
    .replace(bearerPattern, '$1 [REDACTED]')
    .replace(knownTokenPattern, '[REDACTED]');

export const readJson = async (path) => JSON.parse(await readFile(resolve(path), 'utf8'));
