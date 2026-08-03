import { isProxy } from "node:util/types";
import { isAbsolute, relative, resolve, sep } from "node:path";

const INPUT_FIELDS = [
  "repositoryRoot",
  "configuredJournalPath",
  "missionId",
  "hostId",
] as const;

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;

export interface RunGovernedMayDispatchStepInputV1 {
  readonly repositoryRoot: string;
  readonly configuredJournalPath: string;
  readonly missionId: string;
  readonly hostId: string;
}

type RunGovernedMayDispatchStepResultEvidenceV1 = Readonly<Record<string, unknown>>;

export interface RunGovernedMayDispatchStepResultBlockedV1 {
  readonly state: "blocked";
  readonly readiness: "blocked";
  readonly code: string;
  readonly errors: readonly string[];
}

export interface RunGovernedMayDispatchStepResultCompletedV1 {
  readonly state: "completed";
  readonly readiness: "dispatch_ready";
  readonly evidence: RunGovernedMayDispatchStepResultEvidenceV1;
}

export interface RunGovernedMayDispatchStepResultFailedV1 {
  readonly state: "failed";
  readonly readiness: "dispatch_ready";
  readonly evidence: RunGovernedMayDispatchStepResultEvidenceV1;
}

export interface RunGovernedMayDispatchStepResultReplayedV1 {
  readonly state: "replayed";
  readonly readiness: "dispatch_ready";
  readonly evidence: RunGovernedMayDispatchStepResultEvidenceV1;
}

export interface RunGovernedMayDispatchStepResultRecoveryReadyV1 {
  readonly state: "recovery_required";
  readonly readiness: "dispatch_ready";
  readonly code: string;
  readonly errors: readonly string[];
  readonly evidence: RunGovernedMayDispatchStepResultEvidenceV1;
}

export interface RunGovernedMayDispatchStepResultRecoveryIndeterminateV1 {
  readonly state: "recovery_required";
  readonly readiness: "indeterminate";
  readonly code: string;
  readonly errors: readonly string[];
  readonly evidence: RunGovernedMayDispatchStepResultEvidenceV1;
}

export type RunGovernedMayDispatchStepResultV1 =
  | RunGovernedMayDispatchStepResultBlockedV1
  | RunGovernedMayDispatchStepResultCompletedV1
  | RunGovernedMayDispatchStepResultFailedV1
  | RunGovernedMayDispatchStepResultReplayedV1
  | RunGovernedMayDispatchStepResultRecoveryReadyV1
  | RunGovernedMayDispatchStepResultRecoveryIndeterminateV1;

interface InputSnapshotReady {
  readonly state: "ready";
  readonly value: RunGovernedMayDispatchStepInputV1;
}

interface InputSnapshotBlocked {
  readonly state: "blocked";
  readonly code: "input_invalid";
  readonly errors: readonly string[];
}

type InputSnapshot = InputSnapshotReady | InputSnapshotBlocked;

const blocked = (code: "input_invalid", errors: readonly unknown[]): InputSnapshotBlocked => ({
  state: "blocked",
  code,
  errors: stableErrors(errors),
});

function plainObject(value: unknown): value is Record<string, unknown> {
  try {
    return value !== null &&
      typeof value === "object" &&
      !isProxy(value) &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function dataField(source: Record<string, unknown>, key: string): { state: "ok"; value: unknown } | { state: "invalid" } {
  const descriptor = Object.getOwnPropertyDescriptor(source, key);
  if (
    descriptor === undefined ||
    !descriptor.enumerable ||
    !Object.hasOwn(descriptor, "value") ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined
  ) {
    return { state: "invalid" };
  }
  return { state: "ok", value: descriptor.value };
}

function trimOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function isSafeConfiguredJournalPath(repositoryRoot: string, configuredJournalPath: string): boolean {
  if (configuredJournalPath.length === 0 || configuredJournalPath.includes("\0")) return false;
  if (isAbsolute(configuredJournalPath)) return false;
  const root = resolve(repositoryRoot);
  const candidate = resolve(root, configuredJournalPath);
  const fromRoot = relative(root, candidate);
  return fromRoot !== "" && fromRoot !== "." && fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`);
}

function stableErrors(errors: readonly unknown[]): readonly string[] {
  const normalized = errors
    .flatMap((error) => {
      if (typeof error === "string") {
        const message = error.trim();
        return message.length === 0 ? [] : [message];
      }
      if (error instanceof Error && typeof error.message === "string") {
        const message = error.message.trim();
        return message.length === 0 ? [] : [message];
      }
      return [];
    });
  return Object.freeze([...new Set(normalized.sort())]);
}

function snapshotInput(input: unknown): InputSnapshot {
  if (!plainObject(input)) return blocked("input_invalid", ["Governed dispatch input must be a plain object."]);
  const keys = Reflect.ownKeys(input);
  if (keys.length !== INPUT_FIELDS.length) return blocked("input_invalid", ["Governed dispatch input must contain exactly repositoryRoot, configuredJournalPath, missionId, and hostId."]);
  if (keys.some((key) => typeof key !== "string")) return blocked("input_invalid", ["Governed dispatch input contains non-string keys."]);
  const missing = INPUT_FIELDS.find((field) => !Object.hasOwn(input, field));
  if (missing !== undefined) return blocked("input_invalid", [`Governed dispatch input is missing field ${missing}.`]);

  const unknown = keys.filter((key) => !INPUT_FIELDS.includes(key as (typeof INPUT_FIELDS)[number]));
  if (unknown.length > 0) return blocked("input_invalid", ["Governed dispatch input contains unknown fields."]);

  const repositoryRootField = dataField(input, "repositoryRoot");
  const configuredJournalPathField = dataField(input, "configuredJournalPath");
  const missionIdField = dataField(input, "missionId");
  const hostIdField = dataField(input, "hostId");
  if (repositoryRootField.state === "invalid" || configuredJournalPathField.state === "invalid" || missionIdField.state === "invalid" || hostIdField.state === "invalid") {
    return blocked("input_invalid", ["Governed dispatch input must use enumerable data fields only."]);
  }

  const repositoryRootRaw = trimOrEmpty(repositoryRootField.value);
  const configuredJournalPathRaw = trimOrEmpty(configuredJournalPathField.value);
  const missionIdRaw = trimOrEmpty(missionIdField.value);
  const hostIdRaw = trimOrEmpty(hostIdField.value);

  if (repositoryRootRaw.length === 0 || configuredJournalPathRaw.length === 0 || missionIdRaw.length === 0 || hostIdRaw.length === 0) {
    return blocked("input_invalid", ["Governed dispatch input fields must be non-empty strings."]);
  }
  if (!isAbsolute(repositoryRootRaw) || repositoryRootRaw.includes("\0")) {
    return blocked("input_invalid", ["repositoryRoot must be an absolute path and free of control characters."]);
  }
  const repositoryRoot = resolve(repositoryRootRaw);
  if (!isSafeConfiguredJournalPath(repositoryRoot, configuredJournalPathRaw)) {
    return blocked("input_invalid", ["configuredJournalPath must be a safe repository-relative directory path."]);
  }
  if (!identifier(missionIdRaw) || !identifier(hostIdRaw)) {
    return blocked("input_invalid", ["missionId and hostId must match bounded identifier syntax."]);
  }

  return {
    state: "ready",
    value: Object.freeze({
      repositoryRoot,
      configuredJournalPath: configuredJournalPathRaw,
      missionId: missionIdRaw,
      hostId: hostIdRaw,
    }),
  };
}
