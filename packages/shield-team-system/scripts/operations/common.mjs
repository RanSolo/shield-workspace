import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import {
  lstat,
  open,
  realpath,
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
  write: async (handle, bytes) => {
    const { bytesWritten } = await handle.write(bytes, 0, bytes.length, 0);
    if (bytesWritten !== bytes.length) throw new Error('Reserved output write was incomplete.');
  },
  sync: (handle) => handle.sync(),
  close: (handle) => handle.close(),
  stat: (handle) => handle.stat(),
  truncate: (handle, length) => handle.truncate(length),
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

const reservedTarget = async (path, dependencies) => {
  const absolutePath = resolve(path);
  await canonicalExistingDirectory(dirname(absolutePath), dependencies);
  const existing = await dependencies.lstat(absolutePath).catch((error) => {
    if (error?.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!existing?.isFile() || existing.isSymbolicLink()) {
    throw new Error(`Reserved output must be a precreated non-symlink regular file: ${absolutePath}`);
  }
  if (existing.size !== 0) throw new Error(`Reserved output must be empty: ${absolutePath}`);
  if ((existing.mode & 0o777) !== 0o600) throw new Error(`Reserved output must have mode 0600: ${absolutePath}`);
  return { absolutePath, identity: existing };
};

export const resolveReservedOutputPath = async (path, injectedDependencies) => {
  const dependencies = { ...defaultWriteDependencies, ...injectedDependencies };
  return (await reservedTarget(path, dependencies)).absolutePath;
};

export const retainReservedOutput = async (path, injectedDependencies) => {
  const dependencies = { ...defaultWriteDependencies, ...injectedDependencies };
  const { absolutePath, identity: targetBeforeOpen } = await reservedTarget(path, dependencies);
  const parent = dirname(absolutePath);
  let parentHandle;
  let targetHandle;
  const currentIdentity = async (candidate) => dependencies.lstat(candidate).catch(() => undefined);
  try {
    const parentFlags = fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | (fsConstants.O_NOFOLLOW ?? 0);
    parentHandle = await dependencies.open(parent, parentFlags);
    const parentIdentity = await dependencies.stat(parentHandle);
    const parentAtOpen = await currentIdentity(parent);
    if (!parentIdentity.isDirectory() || !parentAtOpen?.isDirectory() || parentAtOpen.isSymbolicLink() || !sameInode(parentIdentity, parentAtOpen)) {
      throw new Error(`Reserved output parent identity changed: ${parent}`);
    }

    await dependencies.beforeTargetOpen?.({ path: absolutePath, parent, parentHandle });
    targetHandle = await dependencies.open(absolutePath, fsConstants.O_RDWR | (fsConstants.O_NOFOLLOW ?? 0));
    const targetIdentity = await dependencies.stat(targetHandle);
    if (!targetIdentity.isFile() || targetIdentity.size !== 0 || (targetIdentity.mode & 0o777) !== 0o600 || !sameInode(targetBeforeOpen, targetIdentity)) {
      throw new Error(`Reserved output target identity changed: ${absolutePath}`);
    }
    return { absolutePath, parent, parentHandle, parentIdentity, targetHandle, targetIdentity, dependencies };
  } catch (error) {
    if (targetHandle) await dependencies.close(targetHandle).catch(() => {});
    if (parentHandle) await dependencies.close(parentHandle).catch(() => {});
    throw error;
  }
};

export const releaseReservedOutput = async (reservation) => {
  const errors = [];
  if (reservation.targetHandle) {
    await reservation.dependencies.close(reservation.targetHandle).catch((error) => errors.push(error));
    reservation.targetHandle = undefined;
  }
  if (reservation.parentHandle) {
    await reservation.dependencies.close(reservation.parentHandle).catch((error) => errors.push(error));
    reservation.parentHandle = undefined;
  }
  if (errors.length > 0) throw new AggregateError(errors, `Reserved output handle release failed: ${reservation.absolutePath}`);
};

export const writeReservedOutput = async (pathOrReservation, content, injectedDependencies) => {
  const ownedReservation = typeof pathOrReservation === 'string';
  const reservation = ownedReservation
    ? await retainReservedOutput(pathOrReservation, injectedDependencies)
    : pathOrReservation;
  const { absolutePath, parent, parentIdentity, targetIdentity, dependencies } = reservation;
  const bytes = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  let writeStarted = false;

  const currentIdentity = async (candidate) => dependencies.lstat(candidate).catch(() => undefined);
  const assertStable = async () => {
    const [currentParent, currentTarget, retainedTarget] = await Promise.all([
      currentIdentity(parent),
      currentIdentity(absolutePath),
      dependencies.stat(reservation.targetHandle),
    ]);
    if (!currentParent?.isDirectory() || currentParent.isSymbolicLink() || !sameInode(parentIdentity, currentParent)) {
      throw new Error(`Reserved output parent identity changed: ${parent}`);
    }
    if (!currentTarget?.isFile() || currentTarget.isSymbolicLink() || !sameInode(targetIdentity, currentTarget) ||
        !retainedTarget.isFile() || !sameInode(targetIdentity, retainedTarget)) {
      throw new Error(`Reserved output target identity changed: ${absolutePath}`);
    }
  };

  try {
    await assertStable();
    await dependencies.beforeWrite?.({ path: absolutePath, parent, parentHandle: reservation.parentHandle, targetHandle: reservation.targetHandle });
    await assertStable();
    writeStarted = true;
    await dependencies.write(reservation.targetHandle, bytes);
    await dependencies.sync(reservation.targetHandle);
    await dependencies.afterWrite?.({ path: absolutePath, parent, parentHandle: reservation.parentHandle, targetHandle: reservation.targetHandle });
    await assertStable();
    await dependencies.sync(reservation.parentHandle);
    await releaseReservedOutput(reservation);
    return absolutePath;
  } catch (error) {
    if (writeStarted && reservation.targetHandle) {
      try {
        await dependencies.truncate(reservation.targetHandle, 0);
        await dependencies.sync(reservation.targetHandle);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], `Reserved output became uncertain and rollback failed: ${absolutePath}`);
      }
    }
    throw error;
  } finally {
    if (ownedReservation || reservation.targetHandle || reservation.parentHandle) {
      await releaseReservedOutput(reservation).catch(() => {});
    }
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

const authorizationHeaderPattern = /\b(authorization[ \t]*:[ \t]*)[^\r\n]*/giu;
const authorizationAssignmentPattern = /\b(authorization\s*=\s*)[^\r\n]*/giu;
const sensitiveFlagPattern = /(^|[\s,;])(--(?:authorization|passcode|password|secret|token|api[-_]?key|access[-_]?token))([ \t]*=[ \t]*|[ \t]+)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/gimu;
const assignmentPattern = /\b(passcode|password|secret|token)(\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;]+)/giu;
const bearerPattern = /\b(Bearer|Basic)[ \t]+[^\s,;'"`]+/giu;
const jwtCandidatePattern = /(^|[^A-Za-z0-9_.-])([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]*)(?=$|[^A-Za-z0-9_.-])/gmu;
const knownTokenPattern = /\b(?:gh[opsu]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+|AKIA[A-Z0-9]{16})[^\s,;'"`]*/gu;
const structuredSecretPattern = /(["'](?:authorization|passcode|password|secret|token|api[-_]?key|access[-_]?token)["'][ \t]*:[ \t]*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^,}\r\n]+)/giu;
const sensitiveNamePattern = /^(?:authorization|passcode|password|secret|token|api[-_]?key|access[-_]?token)$/iu;
const sensitiveFlagNamePattern = /^--(?:authorization|passcode|password|secret|token|api[-_]?key|access[-_]?token)(?:=|$)/iu;
const embeddedSensitiveFlagPattern = /(?:^|[\s,;])--(?:authorization|passcode|password|secret|token|api[-_]?key|access[-_]?token)(?:\s|=|$)/iu;

const redactStructuredValue = (value) => {
  if (Array.isArray(value)) return value.map(redactStructuredValue);
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    sensitiveNamePattern.test(key.replaceAll(/[._]/gu, '-')) ? '[REDACTED]' : redactStructuredValue(child),
  ]));
};

const structuredValueContainsSecret = (value) => {
  if (Array.isArray(value)) return value.some(structuredValueContainsSecret);
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, child]) =>
    sensitiveNamePattern.test(key.replaceAll(/[._]/gu, '-')) || structuredValueContainsSecret(child));
};

const jsonFragmentEnd = (value, start) => {
  const stack = [];
  let quoted = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{') stack.push('}');
    else if (character === '[') stack.push(']');
    else if (character === '}' || character === ']') {
      if (stack.pop() !== character) return undefined;
      if (stack.length === 0) return index + 1;
    }
  }
  return undefined;
};

const redactStructuredFragments = (input) => {
  const value = String(input);
  let output = '';
  let cursor = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '{' && value[index] !== '[') continue;
    const end = jsonFragmentEnd(value, index);
    if (end === undefined) continue;
    try {
      const parsed = JSON.parse(value.slice(index, end));
      if (!structuredValueContainsSecret(parsed)) continue;
      output += value.slice(cursor, index);
      output += JSON.stringify(redactStructuredValue(parsed));
      cursor = end;
      index = end - 1;
    } catch {}
  }
  return `${output}${value.slice(cursor)}`;
};

const decodeBase64UrlJson = (segment) => {
  try {
    const bytes = Buffer.from(segment, 'base64url');
    if (bytes.toString('base64url') !== segment) return undefined;
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    return undefined;
  }
};

const jwtCandidateReplacement = (match, prefix, headerSegment, payloadSegment) => {
  const header = decodeBase64UrlJson(headerSegment);
  const payload = decodeBase64UrlJson(payloadSegment);
  const object = (candidate) => candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate);
  return object(header) && object(payload) && typeof header.alg === 'string' && header.alg !== ''
    ? `${prefix}[REDACTED]`
    : match;
};

export const redact = (value) =>
  redactStructuredFragments(value)
    .replace(authorizationHeaderPattern, '$1[REDACTED]')
    .replace(authorizationAssignmentPattern, '$1[REDACTED]')
    .replace(sensitiveFlagPattern, (_match, prefix, flag, separator) =>
      `${prefix}${flag}${separator.includes('=') ? '=' : ' '}[REDACTED]`)
    .replace(assignmentPattern, '$1$2[REDACTED]')
    .replace(bearerPattern, '$1 [REDACTED]')
    .replace(jwtCandidatePattern, jwtCandidateReplacement)
    .replace(structuredSecretPattern, '$1"[REDACTED]"')
    .replace(knownTokenPattern, '[REDACTED]');

export const credentialBearingArgument = (value) => {
  if (typeof value !== 'string') return true;
  if (sensitiveFlagNamePattern.test(value) || embeddedSensitiveFlagPattern.test(value) || redact(value) !== value) return true;
  try { return structuredValueContainsSecret(JSON.parse(value)); }
  catch { return false; }
};

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
  if (spec.schemaVersion !== 2) errors.push('spec.schemaVersion must equal 2; v1 and other predecessors are unsupported.');
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
    if (Array.isArray(command.argv)) {
      for (const [argumentIndex, argument] of command.argv.entries()) {
        const prior = command.argv[argumentIndex - 1];
        if (credentialBearingArgument(argument) || (typeof prior === 'string' && sensitiveFlagNamePattern.test(prior))) {
          errors.push(`${label}.argv contains a credential-bearing argument at index ${argumentIndex}.`);
        }
      }
    }
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
