import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { canonicalJson } from "./mission-v2.mjs";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u;
const LOCK_OWNER = /^(?=.{1,128}$)[A-Za-z0-9][A-Za-z0-9._:/@#-]*$/;
const LOCK_PREFIX = "may-control-event:";
const EVENT_ID_PREFIX = "may-control-event:";
const EVIDENCE_PREFIX = "may-control:";
const MAY_CONTROL_EVENT_CODE =
  /^(?:may_control_started|may_control_writeFile_completed|may_control_runValidation_completed|may_control_completed|[a-z][a-z0-9_]{0,127})$/u;
const MAY_CONTROL_EVENT_DIRECTORY = "may-control-events";
const LOCK_SUFFIX = ".jsonl.lock";

const MAY_CONTROL_EVENT_FIELDS = [
  "mayControlEventSchemaVersion",
  "authority",
  "eventId",
  "sessionId",
  "code",
  "counter",
  "toolCallId",
  "evidenceRefs",
] as const;

interface MayControlEventStoreValidContractResult<T> {
  readonly state: "valid";
  readonly value: T;
  readonly code?: undefined;
  readonly errors?: undefined;
}

interface MayControlEventStoreInvalidContractResult {
  readonly state: "invalid";
  readonly code: string;
  readonly errors: readonly string[];
  readonly value?: undefined;
}

export type MayControlEventStoreContractResult<T> = MayControlEventStoreValidContractResult<T> | MayControlEventStoreInvalidContractResult;

export interface MayControlEventFilesystemStoreScopeInput {
  readonly repositoryRoot: string;
  readonly sessionId: string;
  readonly lockOwnerId: string;
}

export interface MayControlEvent {
  readonly mayControlEventSchemaVersion: 1;
  readonly authority: "non_authoritative";
  readonly eventId: string;
  readonly sessionId: string;
  readonly code: string;
  readonly counter: number;
  readonly toolCallId: string | null;
  readonly evidenceRefs: readonly string[];
}

export interface MayControlEventReceipt {
  readonly eventId: string;
  readonly appended: true;
}

export interface MayControlEventTerminalStateNone {
  readonly state: "none";
}

export interface MayControlEventTerminalStateTerminal {
  readonly state: "terminal";
  readonly code: string;
  readonly counter: number;
  readonly eventId: string;
  readonly index: number;
}

export type MayControlEventTerminalState = MayControlEventTerminalStateNone | MayControlEventTerminalStateTerminal;

export interface MayControlEventFilesystemLogPaths {
  readonly repositoryRoot: string;
  readonly shieldDirectory: string;
  readonly auditDirectory: string;
  readonly logPath: string;
  readonly lockPath: string;
  readonly repositoryRootExists: boolean;
  readonly shieldDirectoryExists: boolean;
  readonly auditDirectoryExists: boolean;
}

export interface MayControlEventFilesystemLogReadResult {
  readonly logPath: string;
  readonly orderedEvents: readonly MayControlEvent[];
  readonly terminalState: MayControlEventTerminalState;
  readonly bytes: string;
  readonly missing: boolean;
}

export interface MayControlEventFilesystemLogAppendResult {
  readonly logPath: string;
  readonly byteLength: number;
  readonly bytes: string;
  readonly orderedEvents: readonly MayControlEvent[];
  readonly terminalState: MayControlEventTerminalState;
  readonly receipt: MayControlEventReceipt;
}

export interface MayControlEventStoreReadInput {
  readonly repositoryRoot: string;
  readonly sessionId: string;
}

export interface MayControlEventStoreAppendInput extends MayControlEventFilesystemStoreScopeInput {
  readonly event: MayControlEvent;
}

export interface MayControlEventFilesystemStore {
  readonly sessionId: string;
  read(): Promise<MayControlEventFilesystemLogReadResult>;
  appendControlEvent(event: MayControlEvent): Promise<MayControlEventReceipt>;
}

const valid = <T,>(value: T): MayControlEventStoreContractResult<T> => ({ state: "valid", value });
const invalid = <T = never,>(code: string, ...errors: string[]): MayControlEventStoreContractResult<T> =>
  ({ state: "invalid", code, errors: errors.length > 0 ? errors : ["invalid input."] });

function safePlainObject(value: unknown): value is Record<string, unknown> {
  try {
    if (value === null || typeof value !== "object") return false;
    if (Array.isArray(value)) return false;
    return Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function snapshotDescriptorSafeObject<T>(value: T, ancestors = new WeakSet<object>()): MayControlEventStoreContractResult<T> {
  try {
    if (value === null || typeof value !== "object") return valid(value);
    const inputObject = value as object;
    const array = Array.isArray(value);
    if (Object.getPrototypeOf(value) !== (array ? Array.prototype : Object.prototype)) {
      return invalid("malformed_input", "May control event input has an unsafe object shape.");
    }
    if (ancestors.has(inputObject)) return invalid("malformed_input", "May control event input cannot be cyclic.");
    ancestors.add(inputObject);

    const descriptors = Object.getOwnPropertyDescriptors(value as Record<PropertyKey, unknown>) as Record<PropertyKey, PropertyDescriptor>;
    const clone: object = array ? [] : {};
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key as keyof typeof descriptors];
      if (typeof descriptor.get !== "undefined" || typeof descriptor.set !== "undefined") {
        return invalid("malformed_input", "May control event input cannot contain accessor properties.");
      }
      if (!Object.hasOwn(descriptor, "value")) {
        return invalid("malformed_input", "May control event input has invalid property descriptors.");
      }

      const child = snapshotDescriptorSafeObject(descriptor.value, ancestors);
      if (child.state === "invalid") return child;
      Object.defineProperty(clone, key, { ...descriptor, value: child.value });
    }

    ancestors.delete(inputObject);
    Object.freeze(clone);
    return valid(clone as T);
  } catch {
    return invalid("malformed_input", "May control event input has reflective validation failures.");
  }
}

function snapshotMayControlEventEvent(event: MayControlEvent): MayControlEventStoreContractResult<MayControlEvent> {
  return snapshotDescriptorSafeObject(event);
}

function snapshotMayControlEventScopeInput(
  scope: MayControlEventFilesystemStoreScopeInput,
): MayControlEventStoreContractResult<MayControlEventFilesystemStoreScopeInput> {
  return snapshotDescriptorSafeObject(scope);
}

function exactFields(value: unknown, fields: readonly string[], label: string): string[] {
  try {
    if (!safePlainObject(value)) return [`${label} must be a strict plain object.`];

    const expected = new Set(fields);
    const errors: string[] = [];

    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        errors.push(`invalid field: ${String(key)}.`);
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!expected.has(key)) {
        errors.push(`invalid field: ${key}.`);
        continue;
      }
      if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
        errors.push(`invalid field: ${key}.`);
      }
    }

    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor || !Object.hasOwn(descriptor, "value") || !descriptor.enumerable) {
        errors.push(`missing field: ${field}.`);
      }
    }
    return errors;
  } catch {
    return [`${label} has reflective validation failures.`];
  }
}

function validateScopeInput(input: unknown, context: string): MayControlEventStoreContractResult<MayControlEventFilesystemStoreScopeInput> {
  const fieldErrors = exactFields(input, ["repositoryRoot", "sessionId", "lockOwnerId"], context);
  if (fieldErrors.length > 0) return invalid("malformed_input", `${context} has invalid fields.`);

  const value = input as Record<string, unknown>;
  if (typeof value.repositoryRoot !== "string" || value.repositoryRoot.length === 0) {
    return invalid("malformed_input", `${context} repositoryRoot is malformed.`);
  }
  if (!isAbsolute(value.repositoryRoot)) {
    return invalid("malformed_input", `${context} repositoryRoot must be an absolute path.`);
  }
  if (!value.sessionId || typeof value.sessionId !== "string" || !IDENTIFIER.test(value.sessionId)) {
    return invalid("malformed_input", `${context} sessionId is malformed.`);
  }
  if (typeof value.lockOwnerId !== "string" || !LOCK_OWNER.test(value.lockOwnerId)) {
    return invalid("malformed_input", `${context} lockOwnerId is malformed.`);
  }

  return valid({ repositoryRoot: value.repositoryRoot, sessionId: value.sessionId, lockOwnerId: value.lockOwnerId });
}

function classifyMayControlEventCode(code: string): "nonterminal" | "terminal_success" | "terminal_error" {
  if (!MAY_CONTROL_EVENT_CODE.test(code)) return "terminal_error";
  if (
    code === "may_control_started" ||
    code === "may_control_writeFile_completed" ||
    code === "may_control_runValidation_completed"
  )
    return "nonterminal";
  if (code === "may_control_completed") return "terminal_success";
  return "terminal_error";
}

function validateMayControlEventEvent(
  value: unknown,
): MayControlEventStoreContractResult<MayControlEvent> {
  const fieldErrors = exactFields(value, MAY_CONTROL_EVENT_FIELDS, "May control event");
  if (fieldErrors.length > 0) return invalid("malformed_input", "May control event has invalid fields.");

  const source = value as Record<string, unknown>;

  const errors: string[] = [];

  if (source.mayControlEventSchemaVersion !== 1 || source.authority !== "non_authoritative") {
    errors.push("May control event schema version or authority is invalid.");
  }

  if (typeof source.sessionId !== "string" || !IDENTIFIER.test(source.sessionId)) {
    errors.push("May control event sessionId is malformed.");
  }
  if (typeof source.code !== "string") {
    errors.push("May control event code is malformed.");
  }
  if (typeof source.code === "string" && !MAY_CONTROL_EVENT_CODE.test(source.code)) {
    errors.push("May control event code is malformed.");
  }
  const eventCounter = typeof source.counter === "number" && Number.isSafeInteger(source.counter) ? source.counter : undefined;
  if (eventCounter === undefined || eventCounter < 1) {
    errors.push("May control event counter is malformed.");
  }
  if (typeof source.eventId !== "string") {
    errors.push("May control event eventId is malformed.");
  } else if (typeof source.sessionId === "string" && eventCounter !== undefined && eventCounter > 0) {
    const expectedId = `${EVENT_ID_PREFIX}${source.sessionId}:${source.counter}`;
    if (source.eventId !== expectedId) {
      errors.push("May control event eventId is malformed.");
    }
  }
  if (source.toolCallId !== null && (typeof source.toolCallId !== "string" || !IDENTIFIER.test(source.toolCallId))) {
    errors.push("May control event toolCallId is malformed.");
  }

  const evidenceRefs = Array.isArray(source.evidenceRefs) ? source.evidenceRefs : undefined;
  if (evidenceRefs === undefined) {
    errors.push("May control event evidenceRefs is malformed.");
  } else {
    const keys = Reflect.ownKeys(evidenceRefs);
    for (const key of keys) {
      if (key === "length") continue;
      const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(evidenceRefs, key) : undefined;
      if (
        typeof key !== "string" ||
        !/^(?:0|[1-9][0-9]*)$/.test(key) ||
        !descriptor ||
        !Object.hasOwn(descriptor, "value") ||
        !descriptor.enumerable
      ) {
        errors.push("May control event evidenceRefs is malformed.");
      }
    }
    if (evidenceRefs.length !== 1) {
      errors.push("May control event evidenceRefs is malformed.");
    }
    if (errors.length === 0) {
      for (let index = 0; index < evidenceRefs.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(evidenceRefs, String(index));
        if (descriptor === undefined || !Object.hasOwn(descriptor, "value") || typeof descriptor.value !== "string") {
          errors.push("May control event evidenceRefs is malformed.");
          break;
        }
        if (descriptor.value !== `${EVIDENCE_PREFIX}${source.sessionId}`) {
          errors.push("May control event evidenceRefs is malformed.");
          break;
        }
      }
    }
  }

  if (errors.length > 0) return invalid("malformed_input", ...errors);

  return valid({
    mayControlEventSchemaVersion: 1,
    authority: "non_authoritative",
    sessionId: source.sessionId,
    eventId: source.eventId,
    code: source.code,
    counter: eventCounter!,
   toolCallId: source.toolCallId,
    evidenceRefs: [...evidenceRefs!],
  } as MayControlEvent);
}

function validateMayControlEventReceipt(
  input: unknown,
  event: MayControlEvent,
): MayControlEventStoreContractResult<MayControlEventReceipt> {
  const fieldErrors = exactFields(input, ["eventId", "appended"], "May control event receipt");
  if (fieldErrors.length > 0) return invalid("malformed_input", "May control event receipt has invalid fields.");
  const value = input as Record<string, unknown>;
  if (value.eventId !== event.eventId || value.appended !== true) {
    return invalid("malformed_input", "May control event receipt is invalid.");
  }
  return valid({ eventId: event.eventId, appended: true });
}

function validateReadInput(input: unknown): MayControlEventStoreContractResult<MayControlEventStoreReadInput> {
  const snapshot = snapshotDescriptorSafeObject(input);
  if (snapshot.state === "invalid") return snapshot;
  const fieldErrors = exactFields(snapshot.value, ["repositoryRoot", "sessionId"], "read input");
  if (fieldErrors.length > 0) return invalid("malformed_input", "read input has invalid fields.");
  const value = snapshot.value as Record<string, unknown>;
  if (typeof value.repositoryRoot !== "string" || value.repositoryRoot.length === 0) {
    return invalid("malformed_input", "read input repositoryRoot is malformed.");
  }
  if (!isAbsolute(value.repositoryRoot)) {
    return invalid("malformed_input", "read input repositoryRoot must be an absolute path.");
  }
  if (!value.sessionId || typeof value.sessionId !== "string" || !IDENTIFIER.test(value.sessionId)) {
    return invalid("malformed_input", "read input sessionId is malformed.");
  }
  return valid({ repositoryRoot: value.repositoryRoot, sessionId: value.sessionId });
}

function validateAppendInput(input: unknown): MayControlEventStoreContractResult<MayControlEventStoreAppendInput> {
  const snapshot = snapshotDescriptorSafeObject(input);
  if (snapshot.state === "invalid") return snapshot;
  const source = snapshot.value;
  const fieldErrors = exactFields(source, ["repositoryRoot", "sessionId", "lockOwnerId", "event"], "append input");
  if (fieldErrors.length > 0) return invalid("malformed_input", "append input has invalid fields.");

  const inputRecord = source as Record<string, unknown>;
  const scopeInput = validateScopeInput(
    { repositoryRoot: inputRecord.repositoryRoot, sessionId: inputRecord.sessionId, lockOwnerId: inputRecord.lockOwnerId },
    "append input",
  );
  if (scopeInput.state === "invalid") return scopeInput;

  if (!safePlainObject(inputRecord.event)) {
    return invalid("malformed_input", "append input record must be a strict plain object.");
  }

  let checked;
  try {
    checked = validateMayControlEventEvent(inputRecord.event);
  } catch {
    return invalid("malformed_input", "append input record has reflective validation failures.");
  }
  if (checked.state === "invalid") return invalid("malformed_input", ...checked.errors);
  if (checked.value.sessionId !== scopeInput.value.sessionId) return invalid("malformed_input", "append input event sessionId must match configured sessionId.");

  return valid({
    repositoryRoot: scopeInput.value.repositoryRoot,
    sessionId: scopeInput.value.sessionId,
    lockOwnerId: scopeInput.value.lockOwnerId,
    event: checked.value,
  });
}

function mayControlEventFilename(sessionId: string): string {
  return `${createHash("sha256").update(sessionId, "utf8").digest("base64url")}.jsonl`;
}

async function resolveStorePaths(
  scope: MayControlEventFilesystemStoreScopeInput,
  allowCreate: boolean,
): Promise<MayControlEventStoreContractResult<MayControlEventFilesystemLogPaths>> {
  const resolvedInputRoot = resolve(scope.repositoryRoot);
  let repositoryRootInputStats;
  try {
    repositoryRootInputStats = await lstat(resolvedInputRoot);
  } catch (error) {
    return invalid("may_control_event_unavailable", `May control event repository root is unavailable: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }
  if (repositoryRootInputStats.isSymbolicLink() || !repositoryRootInputStats.isDirectory()) {
    return invalid("unsafe_path", "May control event repository root is unsafe.");
  }

  let repositoryRoot: string;

  try {
    repositoryRoot = await realpath(resolvedInputRoot);
  } catch (error) {
    return invalid("may_control_event_unavailable", `May control event repository root is unavailable: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }

  const shieldDirectory = resolve(repositoryRoot, ".shield");
  const shieldFromRoot = relative(repositoryRoot, shieldDirectory);
  if (shieldFromRoot === "" || shieldFromRoot === `..${sep}` || shieldFromRoot.startsWith(`..${sep}`)) {
    return invalid("unsafe_path", "May control event shield directory escapes repository root.");
  }

  let shieldDirectoryExists = true;
  let shieldDirectoryCreated = false;

  try {
    const shieldStats = await lstat(shieldDirectory);
    if (shieldStats.isSymbolicLink() || !shieldStats.isDirectory()) {
      return invalid("unsafe_path", "May control event shield path is not a directory.");
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      if (code === "ELOOP") return invalid("unsafe_path", "May control event shield path is unsafe.");
      return invalid("may_control_event_unavailable", `May control event shield check failed: ${code ?? "unknown_error"}.`);
    }
    if (!allowCreate) {
      return valid({
        repositoryRoot,
        shieldDirectory,
        auditDirectory: resolve(shieldDirectory, MAY_CONTROL_EVENT_DIRECTORY),
        logPath: join(shieldDirectory, MAY_CONTROL_EVENT_DIRECTORY, mayControlEventFilename(scope.sessionId)),
        lockPath: join(shieldDirectory, MAY_CONTROL_EVENT_DIRECTORY, `${mayControlEventFilename(scope.sessionId)}${LOCK_SUFFIX}`),
        repositoryRootExists: true,
        shieldDirectoryExists: false,
        auditDirectoryExists: false,
      });
    }
  try {
    await mkdir(shieldDirectory, { recursive: true });
    shieldDirectoryCreated = true;
    try {
      const shieldCreatedStats = await lstat(shieldDirectory);
      if (shieldCreatedStats.isSymbolicLink() || !shieldCreatedStats.isDirectory()) {
        return invalid("recovery_required", "May control event shield path is not a directory.");
      }
    } catch (error) {
      return invalid("recovery_required", `May control event shield path could not be validated after creation: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
    }
  } catch (error) {
    return invalid(
      "may_control_event_unavailable",
      `May control event shield directory could not be created: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`,
    );
    }
    if (!await syncDirectory(repositoryRoot)) return invalid("recovery_required", "May control event shield directory sync failed.");
    shieldDirectoryExists = true;
  }

  let shieldPath: string;
  try {
    shieldPath = await realpath(shieldDirectory);
  } catch (error) {
    return invalid(shieldDirectoryCreated ? "recovery_required" : "unsafe_path", `May control event shield path is unavailable: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
  }

  if (relative(repositoryRoot, shieldPath) === "" ||
      relative(repositoryRoot, shieldPath) === `..${sep}` ||
      relative(repositoryRoot, shieldPath).startsWith(`..${sep}`)) {
    return invalid("unsafe_path", "May control event shield path escapes repository root.");
  }

  const auditDirectory = resolve(shieldPath, MAY_CONTROL_EVENT_DIRECTORY);
  let auditDirectoryExists = true;
  let auditDirectoryCreated = false;

  try {
    const auditStats = await lstat(auditDirectory);
    if (auditStats.isSymbolicLink() || !auditStats.isDirectory()) {
      return invalid("unsafe_path", "May control event directory is not a directory.");
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      if (code === "ELOOP") return invalid("unsafe_path", "May control event directory is unsafe.");
      return invalid(shieldDirectoryCreated ? "recovery_required" : "may_control_event_unavailable", `May control event directory check failed: ${code ?? "unknown_error"}.`);
    }
    if (!allowCreate) {
      auditDirectoryExists = false;
    } else {
      try {
        await mkdir(auditDirectory, { recursive: true });
        auditDirectoryCreated = true;
        try {
          const auditCreatedStats = await lstat(auditDirectory);
          if (auditCreatedStats.isSymbolicLink() || !auditCreatedStats.isDirectory()) {
            return invalid("recovery_required", "May control event directory is not a directory.");
          }
        } catch (error) {
          return invalid("recovery_required", `May control event directory could not be validated after creation: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
        }
      } catch (error) {
        return invalid(
          shieldDirectoryCreated ? "recovery_required" : "may_control_event_unavailable",
          `May control event directory could not be created: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`,
        );
      }
      auditDirectoryExists = true;
    }
  }

  let auditPath: string;
  try {
    auditPath = await realpath(auditDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      return invalid(shieldDirectoryCreated ? "recovery_required" : "unsafe_path", `May control event directory is unavailable: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
    }
    if (!allowCreate) {
      auditPath = auditDirectory;
    } else {
      return invalid(auditDirectoryCreated ? "recovery_required" : "may_control_event_unavailable", "May control event directory is unavailable after creation.");
    }
  }

  const auditFromRoot = relative(repositoryRoot, auditPath);
  if (auditFromRoot === "" || auditFromRoot === `..${sep}` || auditFromRoot.startsWith(`..${sep}`)) {
    return invalid("unsafe_path", "May control event directory escapes repository root.");
  }

  if (auditDirectoryCreated && !await syncDirectory(shieldPath)) {
    return invalid("recovery_required", "May control event directory sync failed.");
  }

  const filename = mayControlEventFilename(scope.sessionId);
  const logPath = join(auditPath, filename);
  const lockPath = `${logPath}.lock`;

  return valid({
    repositoryRoot,
    shieldDirectory: shieldPath,
    auditDirectory: auditPath,
    logPath,
    lockPath,
    repositoryRootExists: true,
    shieldDirectoryExists,
    auditDirectoryExists,
  });
}

function lineMustMatchCanonical(line: string, event: MayControlEvent): MayControlEventStoreContractResult<void> {
  const canonical = canonicalJson(event);
  if (canonical !== line) {
    return invalid("may_control_event_replay_invalid", `May control event log line is non-canonical: ${line}.`);
  }
  return valid(undefined);
}

interface MayControlEventReplayResult {
  readonly orderedEvents: readonly MayControlEvent[];
  readonly terminalState: MayControlEventTerminalState;
}

function replayMayControlEventLedger(input: readonly unknown[]): MayControlEventStoreContractResult<MayControlEventReplayResult> {
  if (!Array.isArray(input) || Object.getPrototypeOf(input) !== Array.prototype) {
    return invalid("malformed_input", "May control event ledger must be a plain array.");
  }
  for (const key of Reflect.ownKeys(input)) {
    if (key === "length") continue;
    const descriptor = typeof key === "string" ? Object.getOwnPropertyDescriptor(input, key) : undefined;
    if (
      typeof key !== "string" ||
      !/^(?:0|[1-9][0-9]*)$/.test(key) ||
      !descriptor ||
      !Object.hasOwn(descriptor, "value") ||
      !descriptor.enumerable
    ) {
      return invalid("may_control_event_replay_invalid", "May control event ledger has an unsafe array field.");
    }
    if (!Object.hasOwn(input, Number(key))) {
      return invalid("may_control_event_replay_invalid", "May control event ledger must not be sparse.");
    }
  }

  const orderedEvents: MayControlEvent[] = [];
  const eventIds = new Set<string>();
  const toolCallIds = new Set<string>();
  let terminalState: MayControlEventTerminalState = { state: "none" };
  let started = false;
  let validationCompleted = false;
  let expectedCounter = 1;

  for (let index = 0; index < input.length; index += 1) {
    if (!Object.hasOwn(input, index)) return invalid("may_control_event_replay_invalid", "May control event ledger must not be sparse.");
    const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, "value")) {
      return invalid("may_control_event_replay_invalid", "May control event ledger has malformed event.");
    }

    const checked = snapshotDescriptorSafeObject(descriptor.value);
    if (checked.state === "invalid") return invalid("may_control_event_replay_invalid", ...checked.errors);
    const validated = validateMayControlEventEvent(checked.value);
    if (validated.state === "invalid") return invalid("may_control_event_replay_invalid", ...validated.errors);
    const event = validated.value;
    const category = classifyMayControlEventCode(event.code);

    if (eventIds.has(event.eventId)) return invalid("may_control_event_replay_invalid", `May control event ${event.eventId} is duplicated.`);
    eventIds.add(event.eventId);

    const expectedEventId = `${EVENT_ID_PREFIX}${event.sessionId}:${event.counter}`;
    if (event.eventId !== expectedEventId) return invalid("may_control_event_replay_invalid", `May control event line ${index + 1} has an invalid eventId.`);
    if (!Number.isSafeInteger(event.counter) || event.counter < 1 || event.counter !== expectedCounter) {
      return invalid("may_control_event_replay_invalid", `May control event line ${index + 1} has a non-contiguous counter.`);
    }
    expectedCounter += 1;

    if (terminalState.state === "terminal") return invalid("may_control_event_replay_invalid", "May control event has an event after terminal state.");

    if (category === "nonterminal") {
      if (event.code === "may_control_started") {
        if (index !== 0) {
          return invalid("may_control_event_replay_invalid", "May control event has more than one start event.");
        }
        if (started) return invalid("may_control_event_replay_invalid", "May control event has more than one start event.");
        if (event.toolCallId !== null) return invalid("may_control_event_replay_invalid", "May control event tool-call completion must not include toolCallId.");
        started = true;
      } else if (event.code === "may_control_runValidation_completed") {
        if (!started) return invalid("may_control_event_replay_invalid", "May control event runValidation completion requires start.");
        if (event.toolCallId === null) return invalid("may_control_event_replay_invalid", "May control event tool-call completion must include toolCallId.");
        if (!IDENTIFIER.test(event.toolCallId)) return invalid("may_control_event_replay_invalid", "May control event toolCallId is malformed.");
        if (toolCallIds.has(event.toolCallId)) return invalid("may_control_event_replay_invalid", `May control event duplicate toolCallId: ${event.toolCallId}.`);
        toolCallIds.add(event.toolCallId);
      } else if (event.code === "may_control_writeFile_completed") {
        if (!started) return invalid("may_control_event_replay_invalid", "May control event writeFile completion requires start.");
        if (event.toolCallId === null) return invalid("may_control_event_replay_invalid", "May control event tool-call completion must include toolCallId.");
        if (!IDENTIFIER.test(event.toolCallId)) return invalid("may_control_event_replay_invalid", "May control event toolCallId is malformed.");
        if (toolCallIds.has(event.toolCallId)) return invalid("may_control_event_replay_invalid", `May control event duplicate toolCallId: ${event.toolCallId}.`);
        toolCallIds.add(event.toolCallId);
      } else if (event.toolCallId !== null) {
        return invalid("may_control_event_replay_invalid", "May control event toolCallId must be null for this code.");
      }
    } else if (category === "terminal_success") {
      if (!started) return invalid("may_control_event_replay_invalid", "May control event completion requires start.");
      if (!validationCompleted) return invalid("may_control_event_replay_invalid", "May control event completion requires validation completion.");
      if (event.toolCallId !== null) return invalid("may_control_event_replay_invalid", "May control event completion must have null toolCallId.");
      terminalState = { state: "terminal", code: event.code, counter: event.counter, eventId: event.eventId, index };
      started = false;
      validationCompleted = false;
    } else {
      if (index > 0 && !started) {
        return invalid("may_control_event_replay_invalid", "May control event terminal error requires start.");
      }
      if (event.toolCallId !== null) return invalid("may_control_event_replay_invalid", "May control event terminal event must have null toolCallId.");
      terminalState = { state: "terminal", code: event.code, counter: event.counter, eventId: event.eventId, index };
    }

    if (event.code === "may_control_runValidation_completed") {
      validationCompleted = true;
    }

    orderedEvents.push(event);
  }

  return valid({
    orderedEvents: Object.freeze([...orderedEvents]),
    terminalState,
  });
}

function parseMayControlEventLines(
  text: string,
  sessionId: string,
): MayControlEventStoreContractResult<MayControlEventReplayResult> {
  if (text === "") return invalid("may_control_event_replay_invalid", "May control event ledger has empty content.");
  if (!text.endsWith("\n")) return invalid("may_control_event_replay_invalid", "May control event ledger has an incomplete final line.");
  if (text.includes("\u0000")) return invalid("may_control_event_replay_invalid", "May control event ledger has invalid UTF-8 bytes.");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length === 0) return invalid("may_control_event_replay_invalid", "May control event ledger has empty content.");

  const raw: unknown[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.length === 0) return invalid("may_control_event_replay_invalid", `May control event log line ${index + 1} is empty.`);

    const strict = validateStrictJsonLine(line);
    if (strict.state === "invalid") return strict;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      return invalid(
        "may_control_event_replay_invalid",
        `May control event log line ${index + 1} is malformed JSON.`,
      );
    }

    const checked = validateMayControlEventEvent(parsed);
    if (checked.state === "invalid") {
      return invalid("may_control_event_replay_invalid", ...checked.errors);
    }
    const canonicalCheck = lineMustMatchCanonical(line, checked.value);
    if (canonicalCheck.state === "invalid") return canonicalCheck;
    if (checked.value.sessionId !== sessionId) return invalid("may_control_event_replay_invalid", `May control event log line ${index + 1} has a foreign sessionId.`);
    raw.push(checked.value);
  }

  const replayed = replayMayControlEventLedger(raw);
  if (replayed.state === "invalid") return invalid("may_control_event_replay_invalid", ...replayed.errors);
  if (replayed.value.orderedEvents.length !== lines.length) {
    return invalid("may_control_event_replay_invalid", "May control event replay changed record count.");
  }
  for (let index = 0; index < replayed.value.orderedEvents.length; index += 1) {
    if (canonicalJson(replayed.value.orderedEvents[index]) !== lines[index]) return invalid(
      "may_control_event_replay_invalid",
      `May control event log line ${index + 1} is non-canonical.`,
    );
  }
  return valid(replayed.value);
}

export async function readMayControlEventLogV1(
  input: unknown,
): Promise<MayControlEventStoreContractResult<MayControlEventFilesystemLogReadResult>> {
  const checked = validateReadInput(input);
  if (checked.state === "invalid") return checked;
  const snapshot = snapshotDescriptorSafeObject(checked.value);
  if (snapshot.state === "invalid") return snapshot;
  const readScope: MayControlEventFilesystemStoreScopeInput = {
    ...snapshot.value,
    lockOwnerId: "",
  };

  const paths = await resolveStorePaths(readScope, false);
  if (paths.state === "invalid") return paths;

  if (!paths.value.shieldDirectoryExists || !paths.value.auditDirectoryExists) {
    return valid({
      logPath: paths.value.logPath,
      orderedEvents: [],
      terminalState: { state: "none" },
      bytes: "",
      missing: true,
    });
  }

  let handle;
  let bytes = Buffer.alloc(0);
  try {
    handle = await open(paths.value.logPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await handle.stat();
    if (!stats.isFile()) return invalid("unsafe_path", "May control event ledger must be a regular file.");
    bytes = await handle.readFile();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return valid({
        logPath: paths.value.logPath,
        orderedEvents: [],
        terminalState: { state: "none" },
        bytes: "",
        missing: true,
      });
    }
    return invalid(
      code === "ELOOP" ? "unsafe_path" : "may_control_event_unavailable",
      `May control event ledger read failed: ${code ?? "unknown_error"}.`,
    );
  } finally {
    await handle?.close().catch(() => undefined);
  }

  let bytesAsText: string;
  try {
    bytesAsText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return invalid("may_control_event_replay_invalid", "May control event ledger has invalid UTF-8 bytes.");
  }

  const parsed = parseMayControlEventLines(bytesAsText, snapshot.value.sessionId);
  if (parsed.state === "invalid") return parsed;

  return valid({
    logPath: paths.value.logPath,
    orderedEvents: parsed.value.orderedEvents,
    terminalState: parsed.value.terminalState,
    bytes: bytesAsText,
    missing: false,
  });
}

function reconstructReceipt(event: MayControlEvent): MayControlEventStoreContractResult<MayControlEventReceipt> {
  const checkedRecord = snapshotMayControlEventEvent(event);
  if (checkedRecord.state === "invalid") return invalid("malformed_input", ...checkedRecord.errors);

  const candidate: MayControlEventReceipt = { eventId: checkedRecord.value.eventId, appended: true };
  const checked = validateMayControlEventReceipt(candidate, checkedRecord.value);
  if (checked.state === "invalid") return invalid("may_control_event_replay_invalid", "May control event receipt reconstruction failed.");
  return valid(candidate);
}

export async function appendMayControlEventIfAbsentV1(
  input: unknown,
): Promise<MayControlEventStoreContractResult<MayControlEventFilesystemLogAppendResult>> {
  const checked = validateAppendInput(input);
  if (checked.state === "invalid") return checked;
  const scopeSnapshot = snapshotMayControlEventScopeInput({
    repositoryRoot: checked.value.repositoryRoot,
    sessionId: checked.value.sessionId,
    lockOwnerId: checked.value.lockOwnerId,
  });
  if (scopeSnapshot.state === "invalid") return scopeSnapshot;
  const eventSnapshot = snapshotMayControlEventEvent(checked.value.event);
  if (eventSnapshot.state === "invalid") return eventSnapshot;
  const paths = await resolveStorePaths(scopeSnapshot.value, true);
  if (paths.state === "invalid") return paths;

  const token = await acquireLock(paths.value, scopeSnapshot.value.lockOwnerId);
  if (token.state === "invalid") return token;

  const runAppendOperation = async (): Promise<MayControlEventStoreContractResult<MayControlEventFilesystemLogAppendResult>> => {
    const snapshotCurrent = await readMayControlEventLogV1({
      repositoryRoot: scopeSnapshot.value.repositoryRoot,
      sessionId: scopeSnapshot.value.sessionId,
    });
    const current = snapshotCurrent;
    if (current.state === "invalid") {
      return invalid(current.code, ...current.errors);
    }
    const currentEntriesSnapshot = snapshotDescriptorSafeObject(current.value.orderedEvents);
    if (currentEntriesSnapshot.state === "invalid") return invalid("malformed_input", ...currentEntriesSnapshot.errors);
    const currentBytesSnapshot = current.value.bytes;
    const currentEntries = currentEntriesSnapshot.value as unknown as MayControlEvent[];

    const existingIndex = currentEntries.findIndex((entry) => entry.eventId === eventSnapshot.value.eventId);
    if (existingIndex >= 0) {
      const existing = currentEntries[existingIndex];
      if (canonicalJson(existing) === canonicalJson(eventSnapshot.value)) {
        return invalid(
          "may_control_event_sequence_violation",
          `May control event append duplicate is invalid: ${eventSnapshot.value.eventId}.`,
        );
      }
      return invalid("may_control_event_id_conflict", `May control event record ${eventSnapshot.value.eventId} is already present with different payload.`);
    }

    const candidate = [...currentEntries, eventSnapshot.value];
    const replayed = replayMayControlEventLedger(candidate);
    if (replayed.state === "invalid") {
      return invalid("may_control_event_sequence_violation", ...replayed.errors);
    }
    const line = `${canonicalJson(replayed.value.orderedEvents[replayed.value.orderedEvents.length - 1])}\n`;
    const lineBytes = Buffer.byteLength(line, "utf8");

    let logHandle;
    try {
      logHandle = await open(paths.value.logPath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o644);
      const logStats = await logHandle.stat();
      if (!logStats.isFile()) {
        return invalid("unsafe_path", "May control event ledger must be a regular file.");
      }
      const written = (await logHandle.write(line, null, "utf8")).bytesWritten;
      if (written !== lineBytes) {
        return invalid("recovery_required", "May control event append write was incomplete.");
      }
      await logHandle.sync();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return invalid(
        code === "ELOOP" || code === "ENOTDIR" ? "unsafe_path" : "recovery_required",
        code === "ELOOP" || code === "ENOTDIR" ? "May control event ledger path is unsafe." : `May control event append failed: ${code ?? "unknown_error"}.`,
      );
    } finally {
      await logHandle?.close().catch(() => undefined);
    }

    if (current.value.missing) {
      const directorySynced = await syncDirectory(dirname(paths.value.logPath));
      if (!directorySynced) return invalid("recovery_required", "May control event ledger parent directory sync failed.");
    }

    const afterResult = await readMayControlEventLogV1({
      repositoryRoot: scopeSnapshot.value.repositoryRoot,
      sessionId: scopeSnapshot.value.sessionId,
    });
    const after = afterResult;
    if (after.state === "invalid") {
      return invalid("recovery_required", ...after.errors);
    }
    const expected = `${currentBytesSnapshot}${line}`;
    const afterBytes = after.value.bytes;
    if (afterBytes !== expected) {
      return invalid("recovery_required", "May control event readback bytes do not match append expectation.");
    }

    const receipt = reconstructReceipt(eventSnapshot.value);
    if (receipt.state === "invalid") return invalid("recovery_required", ...receipt.errors);

    return valid({
      logPath: paths.value.logPath,
      byteLength: Buffer.byteLength(after.value.bytes, "utf8"),
      bytes: after.value.bytes,
      orderedEvents: after.value.orderedEvents,
      terminalState: after.value.terminalState,
      receipt: receipt.value,
    });
  };

  let operationResult: MayControlEventStoreContractResult<MayControlEventFilesystemLogAppendResult> = invalid(
    "may_control_event_unavailable",
    "May control event append produced no result.",
  );
  let releaseResult: MayControlEventStoreInvalidContractResult | undefined;
  try {
    operationResult = await runAppendOperation();
  } finally {
    const released = await releaseLock(token.value);
    if (released.state === "invalid") {
      releaseResult = released;
    }
  }
  if (releaseResult !== undefined) return invalid("recovery_required", ...releaseResult.errors);
  return operationResult;
}

function validateStrictJsonLine(line: string): MayControlEventStoreContractResult<undefined> {
  try {
    validateStrictJson(line);
  } catch (error) {
    return invalid("may_control_event_replay_invalid", `May control event log line must be strict JSON. ${(error instanceof Error ? error.message : String(error))}`);
  }
  return valid(undefined);
}

function validateStrictJson(input: string): void {
  let index = 0;
  const length = input.length;

  function skipWhitespace(): void {
    while (index < length) {
      const code = input.charCodeAt(index);
      if (code !== 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) break;
      index += 1;
    }
  }

  function parseValue(): void {
    skipWhitespace();
    if (index >= length) throw new Error("empty JSON value");
    const ch = input[index];
    if (ch === "{") {
      parseObject();
      return;
    }
    if (ch === "[") {
      parseArray();
      return;
    }
    if (ch === "\"") {
      parseString();
      return;
    }
    if (ch === "t" && input.slice(index, index + 4) === "true") {
      index += 4;
      return;
    }
    if (ch === "f" && input.slice(index, index + 5) === "false") {
      index += 5;
      return;
    }
    if (ch === "n" && input.slice(index, index + 4) === "null") {
      index += 4;
      return;
    }
    if (ch === "-" || (ch >= "0" && ch <= "9")) {
      parseNumber();
      return;
    }
    throw new Error("malformed JSON token");
  }

  function parseObject(): void {
    index += 1;
    skipWhitespace();
    if (index < length && input[index] === "}") {
      index += 1;
      return;
    }
    const seen = new Set<string>();
    while (index < length) {
      skipWhitespace();
      if (input[index] !== "\"") throw new Error("object key must be quoted");
      const key = parseStringValue();
      if (seen.has(key)) throw new Error("json duplicate key");
      seen.add(key);
      skipWhitespace();
      if (input[index] !== ":") throw new Error("object missing colon");
      index += 1;
      parseValue();
      skipWhitespace();
      if (input[index] === ",") {
        index += 1;
        continue;
      }
      if (input[index] === "}") {
        index += 1;
        return;
      }
      throw new Error("object delimiter missing");
    }
    throw new Error("unterminated object");
  }

  function parseArray(): void {
    index += 1;
    skipWhitespace();
    if (index < length && input[index] === "]") {
      index += 1;
      return;
    }
    while (index < length) {
      parseValue();
      skipWhitespace();
      if (input[index] === ",") {
        index += 1;
        continue;
      }
      if (input[index] === "]") {
        index += 1;
        return;
      }
      throw new Error("array delimiter missing");
    }
    throw new Error("unterminated array");
  }

  function parseStringValue(): string {
    return parseString();
  }

  function parseString(): string {
    if (input[index] !== "\"") throw new Error("JSON string must start with quote.");
    const start = index;
    index += 1;
    let escape = false;
    while (index < length) {
      const ch = input[index];
      if (escape) {
        escape = false;
        index += 1;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        index += 1;
        continue;
      }
      if (ch === "\"") {
        index += 1;
        try {
          return JSON.parse(input.slice(start, index));
        } catch {
          throw new Error("malformed JSON string");
        }
      }
      if (ch === "\n" || ch === "\r") throw new Error("JSON string contains newline");
      index += 1;
    }
    throw new Error("unterminated JSON string");
  }

  function parseNumber(): void {
    if (input[index] === "-") index += 1;
    if (index >= length || !isDecimalDigit(input[index])) throw new Error("invalid number");
    if (input[index] === "0") {
      index += 1;
      if (isDecimalDigit(input[index])) throw new Error("leading zero in number");
    } else {
      while (isDecimalDigit(input[index])) index += 1;
    }
    if (input[index] === ".") {
      index += 1;
      if (!isDecimalDigit(input[index])) throw new Error("invalid fraction");
      while (isDecimalDigit(input[index])) index += 1;
    }
    if (input[index] === "e" || input[index] === "E") {
      index += 1;
      if (input[index] === "+" || input[index] === "-") index += 1;
      if (!isDecimalDigit(input[index])) throw new Error("invalid exponent");
      while (isDecimalDigit(input[index])) index += 1;
    }
  }

  function isDecimalDigit(ch: string | undefined): boolean {
    return ch !== undefined && ch >= "0" && ch <= "9";
  }

  parseValue();
  skipWhitespace();
  if (index !== length) throw new Error("trailing content");
}

interface MayControlEventLockToken {
  readonly lockOwnerId: string;
  readonly marker: string;
  readonly path: string;
  readonly ino: number;
  readonly dev: number;
}

function markerFromOwner(owner: string): string {
  return `${LOCK_PREFIX}${owner}`;
}

async function acquireLock(
  paths: MayControlEventFilesystemLogPaths,
  lockOwnerId: string,
): Promise<MayControlEventStoreContractResult<MayControlEventLockToken>> {
  try {
    const existing = await lstat(paths.lockPath);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      return invalid("unsafe_path", "May control event lock must be a regular file.");
    }
    return invalid("may_control_event_lock_held", "May control event lock is held.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      if ((error as NodeJS.ErrnoException).code === "ELOOP") return invalid("unsafe_path", "May control event lock path is unsafe.");
      return invalid("may_control_event_unavailable", `May control event lock check failed: ${(error as NodeJS.ErrnoException).code ?? "unknown_error"}.`);
    }
  }

  const marker = markerFromOwner(lockOwnerId);
  let handle;
  let lockCreated = false;
  try {
    handle = await open(paths.lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    lockCreated = true;
    const markerBytes = Buffer.byteLength(marker, "utf8");
    const written = await handle.write(marker, null, "utf8");
    if (written.bytesWritten !== markerBytes) return invalid("recovery_required", "May control event lock marker write was incomplete.");
    await handle.sync();
    const stats = await lstat(paths.lockPath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      return invalid("recovery_required", "May control event lock must be a regular file.");
    }
    let markerHandle;
    let markerRead = "";
    try {
      markerHandle = await open(paths.lockPath, constants.O_RDONLY | constants.O_NOFOLLOW);
      markerRead = await markerHandle.readFile("utf8");
    } finally {
      await markerHandle?.close().catch(() => undefined);
    }
    if (markerRead !== marker) {
      return invalid("recovery_required", "May control event lock marker changed during acquisition.");
    }
    const lockParentSynced = await syncDirectory(dirname(paths.lockPath));
    if (!lockParentSynced) return invalid("recovery_required", "May control event lock directory sync failed.");
    return valid({
      lockOwnerId,
      marker,
      path: paths.lockPath,
      ino: Number(stats.ino),
      dev: Number(stats.dev),
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (lockCreated) {
      return invalid("recovery_required", `May control event lock acquisition was uncertain: ${code ?? "unknown_error"}.`);
    }
    if (code === "EEXIST") return invalid("may_control_event_lock_held", "May control event lock is held.");
    if (code === "ELOOP") return invalid("unsafe_path", "May control event lock must not be a symbolic link.");
    return invalid("may_control_event_unavailable", `May control event lock acquisition failed: ${code ?? "unknown_error"}.`);
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function releaseLock(token: MayControlEventLockToken): Promise<MayControlEventStoreContractResult<void>> {
  let handle;
  try {
    handle = await open(token.path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stats = await handle.stat();
    if (Number(stats.ino) !== token.ino || Number(stats.dev) !== token.dev) {
      return invalid("recovery_required", "May control event lock owner identity changed.");
    }
    const marker = await handle.readFile("utf8");
    if (marker !== token.marker) return invalid("recovery_required", "May control event lock owner marker changed.");
    const sameTarget = await isSameLockTarget(token.path, token);
    if (!sameTarget) return invalid("recovery_required", "May control event lock ownership changed before release.");
    await unlink(token.path);
    const lockParentSynced = await syncDirectory(dirname(token.path));
    if (!lockParentSynced) return invalid("recovery_required", "May control event lock parent directory sync failed.");
    return valid(undefined);
  } catch {
    return invalid("recovery_required", "May control event lock release is uncertain.");
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

async function isSameLockTarget(path: string, token: MayControlEventLockToken): Promise<boolean> {
  try {
    const stats = await lstat(path);
    if (stats.isSymbolicLink() || !stats.isFile()) return false;
    return Number(stats.ino) === token.ino && Number(stats.dev) === token.dev;
  } catch {
    return false;
  }
}

async function syncDirectory(path: string): Promise<boolean> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_DIRECTORY);
    await handle.sync();
    return true;
  } catch {
    return false;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

export class MayControlEventStoreError extends Error {
  readonly code: string;

  constructor(code: string, message: string | undefined = code) {
    super(message);
    this.code = code;
  }
}

function throwClosedStoreError(result: MayControlEventStoreInvalidContractResult): never {
  throw new MayControlEventStoreError(result.code, result.errors[0]);
}

export function createMayControlEventFilesystemStore(input: MayControlEventFilesystemStoreScopeInput): MayControlEventFilesystemStore {
  const inputSnapshot = snapshotDescriptorSafeObject(input);
  const checkedInput = inputSnapshot.state === "invalid" ? inputSnapshot : validateScopeInput(inputSnapshot.value, "scope input");
  const resolvedInput = checkedInput.state === "invalid" ? checkedInput : snapshotMayControlEventScopeInput(checkedInput.value);
  if (resolvedInput.state === "invalid") throwClosedStoreError(resolvedInput);

  return {
    sessionId: resolvedInput.value.sessionId,
    async read() {
      const result = await readMayControlEventLogV1({
        repositoryRoot: resolvedInput.value.repositoryRoot,
        sessionId: resolvedInput.value.sessionId,
      });
      if (result.state === "invalid") throwClosedStoreError(result);
      return result.value;
    },
    async appendControlEvent(event) {
      const result = await appendMayControlEventIfAbsentV1({ ...resolvedInput.value, event });
      if (result.state === "invalid") throwClosedStoreError(result);
      return result.value.receipt;
    },
  };
}
