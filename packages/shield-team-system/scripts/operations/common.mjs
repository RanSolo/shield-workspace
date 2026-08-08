import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import {
  lstat,
  open,
  realpath,
  unlink,
} from 'node:fs/promises';
import { dirname, isAbsolute, normalize, resolve, sep } from 'node:path';

export const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

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
  const canonicalRoot = tryGit(root, ['rev-parse', '--path-format=absolute', '--show-toplevel']);
  const branch = tryGit(root, ['branch', '--show-current']);
  const head = git(root, ['rev-parse', 'HEAD']);
  const status = git(root, ['status', '--porcelain=v1']);
  return {
    root: canonicalRoot ?? root,
    branch: branch || null,
    head,
    clean: status === '',
  };
};

const defaultWriteDependencies = {
  lstat,
  open,
  realpath,
  unlink,
  write: (handle, bytes) => handle.writeFile(bytes),
  chmod: (handle, mode) => handle.chmod(mode),
  sync: (handle) => handle.sync(),
  close: (handle) => handle.close(),
  stat: (handle) => handle.stat(),
};

const sameInode = (left, right) => left.dev === right.dev && left.ino === right.ino;

const canonicalExistingDirectory = async (directory, dependencies = defaultWriteDependencies) => {
  const absoluteDirectory = resolve(directory);
  const canonicalDirectory = await dependencies.realpath(absoluteDirectory).catch(() => undefined);
  if (canonicalDirectory !== absoluteDirectory) {
    throw new Error(`Output parent must be an existing canonical non-symlink directory: ${absoluteDirectory}`);
  }
  const info = await dependencies.lstat(absoluteDirectory).catch(() => undefined);
  if (!info?.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Output parent must be an existing canonical non-symlink directory: ${absoluteDirectory}`);
  }
  return absoluteDirectory;
};

export const writeNewFile = async (path, content, injectedDependencies) => {
  const dependencies = { ...defaultWriteDependencies, ...injectedDependencies };
  const absolutePath = resolve(path);
  const parent = await canonicalExistingDirectory(dirname(absolutePath), dependencies);
  const existing = await dependencies.lstat(absolutePath).catch((error) => {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  });
  if (existing) throw new Error(`Refusing to overwrite existing file: ${absolutePath}`);

  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  let handle;
  let createdIdentity;
  let closed = false;
  try {
    const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL |
      (fsConstants.O_NOFOLLOW ?? 0);
    handle = await dependencies.open(absolutePath, flags, 0o600);
    createdIdentity = await dependencies.stat(handle);
    if (!createdIdentity.isFile()) throw new Error(`Created output is not a regular file: ${absolutePath}`);
    await dependencies.write(handle, bytes);
    await dependencies.chmod(handle, 0o600);
    await dependencies.sync(handle);
    const finalIdentity = await dependencies.stat(handle);
    if (!finalIdentity.isFile() || !sameInode(createdIdentity, finalIdentity)) {
      throw new Error(`Created output identity changed: ${absolutePath}`);
    }
    await dependencies.close(handle);
    closed = true;
    handle = undefined;

    const parentHandle = await dependencies.open(parent, fsConstants.O_RDONLY);
    try {
      await dependencies.sync(parentHandle);
    } finally {
      await dependencies.close(parentHandle);
    }
    return absolutePath;
  } catch (error) {
    if (handle && !closed) await dependencies.close(handle).catch(() => {});
    if (createdIdentity) {
      const current = await dependencies.lstat(absolutePath).catch(() => undefined);
      if (current && sameInode(createdIdentity, current)) await dependencies.unlink(absolutePath).catch(() => {});
    }
    throw error;
  }
};

export const snapshotFile = async (path, injected = {}) => {
  const absolutePath = resolve(path);
  await canonicalExistingDirectory(dirname(absolutePath));
  const pathInfo = await lstat(absolutePath).catch(() => undefined);
  if (!pathInfo?.isFile() || pathInfo.isSymbolicLink()) {
    throw new Error(`Artifact is not a non-symlink regular file: ${absolutePath}`);
  }
  const openImpl = injected.open ?? open;
  const handle = await openImpl(
    absolutePath,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new Error(`Artifact is not a regular file: ${absolutePath}`);
    const bytes = await handle.readFile();
    return { path: absolutePath, bytes, size: bytes.length, sha256: sha256(bytes) };
  } finally {
    await handle.close();
  }
};

export const hashFile = async (path) => {
  const snapshot = await snapshotFile(path);
  return { path: snapshot.path, bytes: snapshot.size, sha256: snapshot.sha256 };
};

const assignmentPattern = /(authorization|passcode|password|secret|token)(\s*[:=]\s*)([^\s,;]+)/giu;
const bearerPattern = /\b(Bearer|Basic)\s+[A-Za-z0-9+/=_-]+/gu;
const knownTokenPattern = /\b(?:gh[opsu]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+|AKIA[A-Z0-9]{16})\b/gu;

export const redact = (value) =>
  String(value)
    .replace(assignmentPattern, '$1$2[REDACTED]')
    .replace(bearerPattern, '$1 [REDACTED]')
    .replace(knownTokenPattern, '[REDACTED]');

export const readJsonSnapshot = async (path, injected) => {
  const snapshot = await snapshotFile(path, injected);
  let value;
  try {
    value = JSON.parse(snapshot.bytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${snapshot.path}: ${error instanceof Error ? error.message : error}`);
  }
  return { ...snapshot, value };
};

export const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value) &&
  Object.getPrototypeOf(value) === Object.prototype;

export const exactKeys = (value, keys, label, errors) => {
  if (!isPlainObject(value)) {
    errors.push(`${label} must be an object.`);
    return false;
  }
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) errors.push(`${label} contains unknown field ${key}.`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) errors.push(`${label}.${key} is required.`);
  }
  return true;
};

export const nonEmptyString = (value) => typeof value === 'string' && value.trim() !== '';

const validateStringArray = (value, label, errors, { allowEmpty = false } = {}) => {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    errors.push(`${label} must be ${allowEmpty ? 'an array' : 'a non-empty array'}.`);
    return;
  }
  if (value.some((item) => !nonEmptyString(item))) errors.push(`${label} must contain only non-empty strings.`);
};

export const validateAcceptanceSpec = (spec) => {
  const errors = [];
  if (!exactKeys(spec, ['schemaVersion', 'specType', 'missionId', 'source', 'repository', 'commands', 'criteria'], 'spec', errors)) return errors;
  if (spec.schemaVersion !== 1) errors.push('spec.schemaVersion must equal 1.');
  if (spec.specType !== 'mission-acceptance-spec') errors.push('spec.specType must equal mission-acceptance-spec.');
  if (!nonEmptyString(spec.missionId)) errors.push('spec.missionId must be a non-empty string.');

  if (exactKeys(spec.source, ['key', 'sha256', 'criteriaCount'], 'spec.source', errors)) {
    if (!nonEmptyString(spec.source.key)) errors.push('spec.source.key must be a non-empty string.');
    if (!SHA256_PATTERN.test(spec.source.sha256)) errors.push('spec.source.sha256 must be a lowercase SHA-256 digest.');
    if (!Number.isInteger(spec.source.criteriaCount) || spec.source.criteriaCount < 1) errors.push('spec.source.criteriaCount must be a positive integer.');
  }
  if (exactKeys(spec.repository, ['root', 'branch'], 'spec.repository', errors)) {
    if (!nonEmptyString(spec.repository.root) || resolve(spec.repository.root ?? '') !== spec.repository.root) errors.push('spec.repository.root must be an absolute canonical path.');
    if (!nonEmptyString(spec.repository.branch)) errors.push('spec.repository.branch must be a non-empty string.');
  }

  if (!Array.isArray(spec.commands) || spec.commands.length === 0) errors.push('spec.commands must be a non-empty array.');
  const commandIds = new Set();
  for (const [index, command] of (Array.isArray(spec.commands) ? spec.commands : []).entries()) {
    const label = `spec.commands[${index}]`;
    if (!exactKeys(command, ['id', 'executable', 'argv', 'timeoutMs', 'artifacts'], label, errors)) continue;
    if (!nonEmptyString(command.id)) errors.push(`${label}.id must be a non-empty string.`);
    if (commandIds.has(command.id)) errors.push(`Duplicate command ID: ${command.id}`);
    commandIds.add(command.id);
    if (!nonEmptyString(command.executable) || !isAbsolute(command.executable)) errors.push(`${label}.executable must be an absolute path.`);
    validateStringArray(command.argv, `${label}.argv`, errors, { allowEmpty: true });
    if (!Number.isInteger(command.timeoutMs) || command.timeoutMs < 1 || command.timeoutMs > 3_600_000) errors.push(`${label}.timeoutMs must be an integer from 1 through 3600000.`);
    validateStringArray(command.artifacts, `${label}.artifacts`, errors, { allowEmpty: true });
    if (Array.isArray(command.artifacts) && new Set(command.artifacts).size !== command.artifacts.length) errors.push(`${label}.artifacts contains duplicates.`);
    for (const artifact of (Array.isArray(command.artifacts) ? command.artifacts : [])) {
      const normalized = normalize(artifact);
      if (isAbsolute(artifact) || normalized === '..' || normalized.startsWith(`..${sep}`)) errors.push(`${label}.artifacts must contain only repository-relative paths.`);
    }
  }

  if (!Array.isArray(spec.criteria) || spec.criteria.length === 0) errors.push('spec.criteria must be a non-empty array.');
  if (spec.source?.criteriaCount !== spec.criteria?.length) errors.push(`Source criterion count is ${spec.source?.criteriaCount}; spec contains ${spec.criteria?.length ?? 0}.`);
  const criterionIds = new Set();
  const referencedCommands = new Set();
  for (const [index, criterion] of (Array.isArray(spec.criteria) ? spec.criteria : []).entries()) {
    const label = `spec.criteria[${index}]`;
    if (!exactKeys(criterion, ['id', 'sourceText', 'validation'], label, errors)) continue;
    if (!nonEmptyString(criterion.id)) errors.push(`${label}.id must be a non-empty string.`);
    if (criterionIds.has(criterion.id)) errors.push(`Duplicate criterion ID: ${criterion.id}`);
    criterionIds.add(criterion.id);
    if (!nonEmptyString(criterion.sourceText)) errors.push(`${label}.sourceText must be a non-empty string.`);
    const validation = criterion.validation;
    if (!isPlainObject(validation)) {
      errors.push(`${label}.validation must be an object.`);
      continue;
    }
    if (validation.mode === 'automated') {
      if (!exactKeys(validation, ['mode', 'testPaths', 'commandIds', 'negativeCaseRequired', 'negativeTestPaths'], `${label}.validation`, errors)) continue;
      validateStringArray(validation.testPaths, `${label}.validation.testPaths`, errors);
      validateStringArray(validation.commandIds, `${label}.validation.commandIds`, errors);
      if (Array.isArray(validation.commandIds) && new Set(validation.commandIds).size !== validation.commandIds.length) errors.push(`${label}.validation.commandIds contains duplicates.`);
      if (typeof validation.negativeCaseRequired !== 'boolean') errors.push(`${label}.validation.negativeCaseRequired must be boolean.`);
      validateStringArray(validation.negativeTestPaths, `${label}.validation.negativeTestPaths`, errors, { allowEmpty: !validation.negativeCaseRequired });
      for (const commandId of (Array.isArray(validation.commandIds) ? validation.commandIds : [])) {
        if (!commandIds.has(commandId)) errors.push(`${label} references unknown command ID ${commandId}.`);
        referencedCommands.add(commandId);
      }
    } else if (validation.mode === 'manual') {
      if (!exactKeys(validation, ['mode', 'procedure', 'expectedResult'], `${label}.validation`, errors)) continue;
      validateStringArray(validation.procedure, `${label}.validation.procedure`, errors);
      if (!nonEmptyString(validation.expectedResult)) errors.push(`${label}.validation.expectedResult must be a non-empty string.`);
    } else {
      errors.push(`${label}.validation.mode must equal automated or manual.`);
    }
  }
  for (const commandId of commandIds) if (!referencedCommands.has(commandId)) errors.push(`Command ID ${commandId} is not assigned to an automated criterion.`);
  return errors;
};
