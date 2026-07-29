import { createHash } from "node:crypto";

import {
  canonicalJson,
  type EvidenceTimestamp,
} from "./mission-v2.mjs";
import {
  createProfileAwareExecutionEffectEntryV1,
  replayProfileAwareMissionJournal,
  type ProfileAwareMissionEntryV1,
  type ProfileAwareProjectionV1,
} from "./profile-aware-mission-v1.mjs";
import {
  createPermissionAuthorizer,
  createRuntimeClaimedExecutorV1,
  replayRuntimeInvocationClaimsV1,
  validatePermissionInvocationContext,
  type PermissionInvocationContext,
} from "./permission-v1.mjs";
import type { PermissionAuditRecord } from "./permission-audit-v1.mjs";
import {
  runRunnerCycle,
  type RunnerCyclePlan,
  type RunnerEffectClass,
  type RunnerModeReference,
  type RunnerProjectionSnapshot,
  type RunnerStopReason,
} from "./runner-v1.mjs";

export interface MissionCycleInputV1 {
  repositoryRoot: string;
  configuredJournalPath: string;
  missionId: string;
  expectedSubjectId: string;
  expectedRevisionId: string;
  expectedSequence: number;
  seatId: string;
  actionId: string;
  effectClass: RunnerEffectClass;
  validationId: string;
  activatedModes: RunnerModeReference[];
  actionAllowlist: string[];
}

export interface ProfileAwareJournalSnapshotV1 {
  entries: ProfileAwareMissionEntryV1[];
  projection: ProfileAwareProjectionV1;
  journalDigest: string;
}

export type MissionJournalAppendResultV1 =
  | { state: "appended"; journalPath: string }
  | {
      state: "blocked";
      code: "journal_lock_held" | "journal_unavailable" | "stale_sequence";
      errors: string[];
    }
  | { state: "uncertain"; code: "recovery_required"; errors: string[] };

export interface MissionCycleDependenciesV1 {
  readJournal(input: {
    repositoryRoot: string;
    configuredJournalPath: string;
    missionId: string;
  }): Promise<ProfileAwareJournalSnapshotV1>;
  appendJournal(input: {
    repositoryRoot: string;
    configuredJournalPath: string;
    missionId: string;
    entry: ProfileAwareMissionEntryV1;
  }): Promise<MissionJournalAppendResultV1>;
  permissionAudit: {
    ledgerId: string;
    read(): Promise<unknown>;
    appendIfAbsent(record: PermissionAuditRecord): Promise<unknown>;
  };
  getPermissionContext(
    input: RunnerCyclePlan,
    expectedDecisionId: string,
  ): unknown | Promise<unknown>;
  executeTool(input: RunnerCyclePlan, decision: import("./runner-v1.mjs").RunnerPermissionDecision): unknown | Promise<unknown>;
  requiredCapabilities(input: RunnerCyclePlan): string[];
  validate(
    input: RunnerCyclePlan,
    result: import("./runner-v1.mjs").RunnerExecutorResult,
  ): unknown | Promise<unknown>;
  now(): EvidenceTimestamp;
}

export type MissionCycleReasonCodeV1 =
  | "mission_authorization_required"
  | "gate_missing"
  | RunnerStopReason
  | "input_invalid"
  | "stale_subject"
  | "stale_revision"
  | "stale_sequence"
  | "duplicate_effect"
  | "effect_identity_mismatch"
  | "audit_invalid"
  | "audit_incomplete"
  | "audit_result_uncertain"
  | "journal_lock_held"
  | "journal_unavailable"
  | "recovery_required"
  | "transition_readback_mismatch"
  | "effect_readback_mismatch"
  | "complete";

export type MissionCycleResultV1 =
  | {
      outcome: "blocked";
      missionId: null;
      subjectId: null;
      revisionId: null;
      sequence: null;
      accountableNextSeat: null;
      reasonCode: "input_invalid";
    }
  | {
      outcome: "advanced";
      missionId: string;
      subjectId: string;
      revisionId: string;
      sequence: number;
      accountableNextSeat: "hill";
      cycleId: string;
      effectKey: string;
    }
  | {
      outcome: "waiting" | "blocked" | "uncertain" | "complete";
      missionId: string;
      subjectId: string;
      revisionId: string;
      sequence: number;
      accountableNextSeat: string | null;
      reasonCode: MissionCycleReasonCodeV1;
    };

interface DerivedIdentity {
  cycleId: string;
  effectKey: string;
  decisionId: string;
}

interface MissionIdentityEnvelopeV1 {
  missionId: string;
  expectedSubjectId: string;
  expectedRevisionId: string;
  expectedSequence: number;
}

const INPUT_FIELDS = [
  "repositoryRoot",
  "configuredJournalPath",
  "missionId",
  "expectedSubjectId",
  "expectedRevisionId",
  "expectedSequence",
  "seatId",
  "actionId",
  "effectClass",
  "validationId",
  "activatedModes",
  "actionAllowlist",
] as const;
const DEPENDENCY_FIELDS = [
  "readJournal",
  "appendJournal",
  "permissionAudit",
  "getPermissionContext",
  "executeTool",
  "requiredCapabilities",
  "validate",
  "now",
] as const;
const PERMISSION_AUDIT_FIELDS = ["ledgerId", "read", "appendIfAbsent"] as const;
const MODE_FIELDS = ["modeId", "modeVersion", "seatId", "activationSource"] as const;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const EFFECT_CLASSES = new Set<RunnerEffectClass>([
  "behavioral_implementation",
  "verification",
  "coordination",
]);

function safeDataObject(
  value: unknown,
  fields: readonly string[],
): { state: "valid"; values: Record<string, unknown> } | { state: "invalid" } {
  try {
    if (value === null ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.getPrototypeOf(value) !== Object.prototype) {
      return { state: "invalid" };
    }
    const keys = Reflect.ownKeys(value);
    if (keys.length !== fields.length ||
        keys.some((key) => typeof key !== "string" || !fields.includes(key))) {
      return { state: "invalid" };
    }
    const values: Record<string, unknown> = {};
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, field);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) {
        return { state: "invalid" };
      }
      values[field] = descriptor.value;
    }
    return { state: "valid", values };
  } catch {
    return { state: "invalid" };
  }
}

function safeArrayValues(value: unknown): unknown[] | null {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) =>
      key !== "length" &&
      (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(key)))) {
      return null;
    }
    const values: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return null;
      values.push(descriptor.value);
    }
    return values;
  } catch {
    return null;
  }
}

function safeJsonCopy(value: unknown): unknown | null {
  if (value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))) {
    return value;
  }
  const array = safeArrayValues(value);
  if (array !== null) {
    const copy: unknown[] = [];
    for (const item of array) {
      const itemCopy = safeJsonCopy(item);
      if (itemCopy === null && item !== null) return null;
      copy.push(itemCopy);
    }
    return Object.freeze(copy);
  }
  try {
    if (value === null ||
        typeof value !== "object" ||
        Object.getPrototypeOf(value) !== Object.prototype) {
      return null;
    }
    const copy: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return null;
      const itemCopy = safeJsonCopy(descriptor.value);
      if (itemCopy === null && descriptor.value !== null) return null;
      copy[key] = itemCopy;
    }
    return Object.freeze(copy);
  } catch {
    return null;
  }
}

function validIdentifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function inspectIdentityEnvelope(input: unknown): MissionIdentityEnvelopeV1 | null {
  try {
    if (input === null ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        Object.getPrototypeOf(input) !== Object.prototype) {
      return null;
    }
    const values: Record<string, unknown> = {};
    for (const field of ["missionId", "expectedSubjectId", "expectedRevisionId", "expectedSequence"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) return null;
      values[field] = descriptor.value;
    }
    if (!validIdentifier(values.missionId) ||
        !validIdentifier(values.expectedSubjectId) ||
        typeof values.expectedRevisionId !== "string" ||
        !REVISION.test(values.expectedRevisionId) ||
        !Number.isSafeInteger(values.expectedSequence) ||
        (values.expectedSequence as number) < 0) {
      return null;
    }
    return Object.freeze(values) as unknown as MissionIdentityEnvelopeV1;
  } catch {
    return null;
  }
}

function validateAndFreezeInput(input: unknown): MissionCycleInputV1 | null {
  const checked = safeDataObject(input, INPUT_FIELDS);
  if (checked.state === "invalid") return null;
  const value = checked.values;
  if (!validIdentifier(value.missionId) ||
      !validIdentifier(value.expectedSubjectId) ||
      typeof value.expectedRevisionId !== "string" ||
      !REVISION.test(value.expectedRevisionId) ||
      !Number.isSafeInteger(value.expectedSequence) ||
      (value.expectedSequence as number) < 0 ||
      typeof value.repositoryRoot !== "string" ||
      !value.repositoryRoot.startsWith("/") ||
      value.repositoryRoot.includes("\0") ||
      typeof value.configuredJournalPath !== "string" ||
      value.configuredJournalPath.length === 0 ||
      value.configuredJournalPath.includes("\0") ||
      !validIdentifier(value.seatId) ||
      !validIdentifier(value.actionId) ||
      !EFFECT_CLASSES.has(value.effectClass as RunnerEffectClass) ||
      !validIdentifier(value.validationId)) {
    return null;
  }
  const modes = safeArrayValues(value.activatedModes);
  const allowlist = safeArrayValues(value.actionAllowlist);
  if (modes === null || allowlist === null ||
      allowlist.some((action) => !validIdentifier(action)) ||
      new Set(allowlist).size !== allowlist.length) {
    return null;
  }
  const frozenModes: RunnerModeReference[] = [];
  for (const mode of modes) {
    const checkedMode = safeDataObject(mode, MODE_FIELDS);
    if (checkedMode.state === "invalid" ||
        !MODE_FIELDS.every((field) => validIdentifier(checkedMode.values[field]))) {
      return null;
    }
    frozenModes.push(Object.freeze({ ...checkedMode.values }) as unknown as RunnerModeReference);
  }
  return Object.freeze({
    repositoryRoot: value.repositoryRoot,
    configuredJournalPath: value.configuredJournalPath,
    missionId: value.missionId,
    expectedSubjectId: value.expectedSubjectId,
    expectedRevisionId: value.expectedRevisionId,
    expectedSequence: value.expectedSequence,
    seatId: value.seatId,
    actionId: value.actionId,
    effectClass: value.effectClass,
    validationId: value.validationId,
    activatedModes: Object.freeze(frozenModes),
    actionAllowlist: Object.freeze([...allowlist]),
  }) as MissionCycleInputV1;
}

function validateAndFreezeDependencies(
  dependencies: unknown,
): MissionCycleDependenciesV1 | null {
  const checked = safeDataObject(dependencies, DEPENDENCY_FIELDS);
  if (checked.state === "invalid") return null;
  const audit = safeDataObject(checked.values.permissionAudit, PERMISSION_AUDIT_FIELDS);
  if (audit.state === "invalid" ||
      !validIdentifier(audit.values.ledgerId) ||
      typeof audit.values.read !== "function" ||
      typeof audit.values.appendIfAbsent !== "function" ||
      DEPENDENCY_FIELDS.filter((field) => field !== "permissionAudit")
        .some((field) => typeof checked.values[field] !== "function")) {
    return null;
  }
  return Object.freeze({
    readJournal: checked.values.readJournal,
    appendJournal: checked.values.appendJournal,
    permissionAudit: Object.freeze({
      ledgerId: audit.values.ledgerId,
      read: audit.values.read,
      appendIfAbsent: audit.values.appendIfAbsent,
    }),
    getPermissionContext: checked.values.getPermissionContext,
    executeTool: checked.values.executeTool,
    requiredCapabilities: checked.values.requiredCapabilities,
    validate: checked.values.validate,
    now: checked.values.now,
  }) as MissionCycleDependenciesV1;
}

function timestamp(value: unknown): EvidenceTimestamp | null {
  const checked = safeDataObject(value, ["value", "provenance"]);
  if (checked.state === "invalid" ||
      typeof checked.values.value !== "string" ||
      !ISO_UTC.test(checked.values.value) ||
      !Number.isFinite(Date.parse(checked.values.value)) ||
      (checked.values.provenance !== "humanRecorded" &&
       checked.values.provenance !== "hostTrusted")) {
    return null;
  }
  return Object.freeze({ ...checked.values }) as unknown as EvidenceTimestamp;
}

function boundInputInvalid(identity: MissionIdentityEnvelopeV1): MissionCycleResultV1 {
  return {
    outcome: "blocked",
    missionId: identity.missionId,
    subjectId: identity.expectedSubjectId,
    revisionId: identity.expectedRevisionId,
    sequence: identity.expectedSequence,
    accountableNextSeat: "coulson",
    reasonCode: "input_invalid",
  };
}

function unboundInputInvalid(): MissionCycleResultV1 {
  return {
    outcome: "blocked",
    missionId: null,
    subjectId: null,
    revisionId: null,
    sequence: null,
    accountableNextSeat: null,
    reasonCode: "input_invalid",
  };
}

function digestIdentity(domain: string, value: unknown): string {
  return createHash("sha256")
    .update(domain)
    .update("\0")
    .update(canonicalJson(value))
    .digest("base64url");
}

export function deriveMissionCycleIdentityV1(input: MissionCycleInputV1): DerivedIdentity {
  const identity = {
    contractVersion: 1,
    missionId: input.missionId,
    revisionId: input.expectedRevisionId,
    baseSequence: input.expectedSequence,
    seatId: input.seatId,
    actionId: input.actionId,
    effectClass: input.effectClass,
    validationId: input.validationId,
  };
  return {
    cycleId: `cycle:sha256:${digestIdentity("shield.runner-cycle.v1", identity)}`,
    effectKey: `effect:sha256:${digestIdentity("shield.runner-effect.v1", identity)}`,
    decisionId: `decision:sha256:${digestIdentity("shield.permission-decision.v1", identity)}`,
  };
}

function stopped(
  projection: ProfileAwareProjectionV1,
  outcome: "waiting" | "blocked" | "uncertain" | "complete",
  accountableNextSeat: string | null,
  reasonCode: MissionCycleReasonCodeV1,
): MissionCycleResultV1 {
  return {
    outcome,
    missionId: projection.missionId,
    subjectId: projection.brief.subjectId,
    revisionId: projection.brief.revisionId,
    sequence: projection.lastSequence,
    accountableNextSeat,
    reasonCode,
  };
}

function exactEffect(
  projection: ProfileAwareProjectionV1,
  identity: DerivedIdentity,
  input: MissionCycleInputV1,
): "completed" | "uncertain" | "mismatch" | null {
  const effect = projection.effects.find(({ effectKey }) => effectKey === identity.effectKey);
  if (effect === undefined) return null;
  if (effect.cycleId !== identity.cycleId ||
      effect.authorizationDecisionId !== identity.decisionId ||
      effect.subjectId !== projection.brief.subjectId ||
      effect.revisionId !== input.expectedRevisionId ||
      effect.seatId !== input.seatId ||
      effect.actionId !== input.actionId ||
      effect.effectClass !== input.effectClass) {
    return "mismatch";
  }
  return effect.outcome;
}

function exactTransition(entry: ProfileAwareMissionEntryV1 | undefined, input: MissionCycleInputV1): boolean {
  return entry?.schemaVersion === 9 &&
    entry.entryId === `entry:${input.missionId}:${input.expectedSequence + 1}` &&
    entry.missionId === input.missionId &&
    entry.sequence === input.expectedSequence + 1 &&
    entry.type === "execution.transition" &&
    entry.payload.from === "not-started" &&
    entry.payload.to === "running";
}

function runnerProjection(projection: ProfileAwareProjectionV1): RunnerProjectionSnapshot {
  return {
    runnerContractVersion: 1,
    journalSchemaVersion: 9,
    missionId: projection.missionId,
    subjectId: projection.brief.subjectId,
    revisionId: projection.brief.revisionId,
    evaluatedThroughSequence: projection.lastSequence,
    governanceState: projection.authorization === "authorized" ? "approved" : "proposed",
    missionAuthorizationState: projection.authorization,
    executionStatus: projection.execution,
    executeReadiness: projection.readiness.execute,
    participantSeatIds: projection.brief.participants.map(({ seatId }) => seatId),
    activatedModes: projection.brief.activatedModes.map((mode) => ({ ...mode })),
    effectRecords: projection.effects.map((effect) => ({ ...effect })),
  };
}

function pendingGate(projection: ProfileAwareProjectionV1): { role: string; authorization: boolean } | null {
  const satisfied = new Set(projection.evidence.map(({ requirementId }) => requirementId));
  const requirement = projection.requirements.find(({ phase, requirementId }) =>
    (phase === "authorization" || phase === "execution") && !satisfied.has(requirementId));
  return requirement === undefined
    ? null
    : { role: requirement.requiredRoleId, authorization: requirement.phase === "authorization" };
}

async function readValidated(
  input: MissionCycleInputV1,
  dependencies: MissionCycleDependenciesV1,
): Promise<ProfileAwareJournalSnapshotV1 | null> {
  try {
    const rawSnapshot = await dependencies.readJournal({
      repositoryRoot: input.repositoryRoot,
      configuredJournalPath: input.configuredJournalPath,
      missionId: input.missionId,
    });
    const copied = safeJsonCopy(rawSnapshot);
    if (copied === null || typeof copied !== "object") return null;
    const snapshot = copied as ProfileAwareJournalSnapshotV1;
    if (typeof snapshot.journalDigest !== "string" ||
        !/^sha256:(?:[A-Fa-f0-9]{64}|[A-Za-z0-9_-]{43})$/.test(snapshot.journalDigest)) {
      return null;
    }
    const replayed = replayProfileAwareMissionJournal(snapshot.entries);
    if (replayed.state === "invalid" ||
        canonicalJson(replayed.value) !== canonicalJson(snapshot.projection) ||
        snapshot.projection.missionId !== input.missionId) {
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function appendResult(value: unknown): MissionJournalAppendResultV1 | null {
  const copied = safeJsonCopy(value);
  if (copied === null || typeof copied !== "object" || Array.isArray(copied)) return null;
  const result = copied as MissionJournalAppendResultV1;
  if (result.state === "appended") {
    return typeof result.journalPath === "string" ? result : null;
  }
  if (result.state === "blocked") {
    return (result.code === "journal_lock_held" ||
      result.code === "journal_unavailable" ||
      result.code === "stale_sequence") &&
      Array.isArray(result.errors) &&
      result.errors.every((error) => typeof error === "string")
      ? result
      : null;
  }
  if (result.state === "uncertain") {
    return result.code === "recovery_required" &&
      Array.isArray(result.errors) &&
      result.errors.every((error) => typeof error === "string")
      ? result
      : null;
  }
  return null;
}

function sameCapabilities(left: string[], right: string[]): boolean {
  return left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function preDispatchOutcome(
  projection: ProfileAwareProjectionV1,
  reason: RunnerStopReason,
  requestedSeat: string,
): MissionCycleResultV1 {
  if (reason === "authorization_wait") return stopped(projection, "waiting", "coulson", reason);
  const requestedSeatReasons = new Set<RunnerStopReason>([
    "identity_mismatch",
    "seat_not_participating",
    "seat_not_executable",
    "implementation_owner_mismatch",
    "mode_context_mismatch",
    "action_not_allowlisted",
    "authorization_denied",
    "authorization_failed",
    "authorization_malformed",
    "authorization_stale",
  ]);
  return stopped(projection, "blocked", requestedSeatReasons.has(reason) ? requestedSeat : "coulson", reason);
}

async function runMissionCycleValidated(
  input: MissionCycleInputV1,
  dependencies: MissionCycleDependenciesV1,
  phase: { postClaim: boolean },
): Promise<MissionCycleResultV1> {
  let snapshot = await readValidated(input, dependencies);
  if (snapshot === null) {
    return {
      outcome: "blocked",
      missionId: input.missionId,
      subjectId: input.expectedSubjectId,
      revisionId: input.expectedRevisionId,
      sequence: input.expectedSequence,
      accountableNextSeat: "coulson",
      reasonCode: "journal_unavailable",
    };
  }
  let projection = snapshot.projection;
  if (projection.brief.subjectId !== input.expectedSubjectId) {
    return stopped(projection, "blocked", "coulson", "stale_subject");
  }
  if (projection.brief.revisionId !== input.expectedRevisionId) {
    return stopped(projection, "blocked", "coulson", "stale_revision");
  }
  const identity = deriveMissionCycleIdentityV1(input);
  if (projection.effects.some(({ outcome }) => outcome === "uncertain")) {
    return stopped(projection, "uncertain", "coulson", "effect_outcome_uncertain");
  }
  const replayedEffect = exactEffect(projection, identity, input);
  if (replayedEffect === "mismatch") {
    return stopped(projection, "blocked", "coulson", "effect_identity_mismatch");
  }
  if (replayedEffect === "completed") return stopped(projection, "complete", null, "complete");
  if (replayedEffect === "uncertain") {
    return stopped(projection, "uncertain", "coulson", "effect_outcome_uncertain");
  }
  const transitionReplayed = projection.lastSequence === input.expectedSequence + 1 &&
    exactTransition(snapshot.entries[input.expectedSequence + 1], input);
  if (projection.lastSequence !== input.expectedSequence && !transitionReplayed) {
    return stopped(projection, "blocked", "coulson", "stale_sequence");
  }
  let runningSequence = transitionReplayed ? input.expectedSequence + 1 : input.expectedSequence;

  let audit: PermissionAuditRecord[];
  try {
    const checkedAudit = replayRuntimeInvocationClaimsV1(await dependencies.permissionAudit.read());
    if (checkedAudit.state === "invalid") return stopped(projection, "blocked", "coulson", "audit_invalid");
    audit = checkedAudit.value;
  } catch {
    return stopped(projection, "blocked", "coulson", "audit_invalid");
  }
  const tupleInvocations = audit.filter((record) =>
    record.recordType === "tool.invocation" &&
    record.missionId === input.missionId &&
    record.revisionId === input.expectedRevisionId &&
    record.journalSequence === runningSequence);
  if (tupleInvocations.some(({ decisionId }) => decisionId !== identity.decisionId)) {
    return stopped(projection, "blocked", "coulson", "invocation_claim_conflict");
  }
  const decisionRecords = audit.filter(({ decisionId }) => decisionId === identity.decisionId);
  const invocation = decisionRecords.find(({ recordType }) => recordType === "tool.invocation");
  const result = decisionRecords.find(({ recordType }) => recordType === "tool.result");
  if (invocation !== undefined) {
    if (result === undefined) return stopped(projection, "uncertain", "coulson", "audit_incomplete");
    if (result.outcome !== "completed") {
      return stopped(projection, "uncertain", "coulson", "audit_result_uncertain");
    }
    return stopped(projection, "uncertain", "coulson", "audit_incomplete");
  }

  const gate = pendingGate(projection);
  if (gate !== null) {
    return stopped(
      projection,
      "waiting",
      gate.role,
      gate.authorization ? "mission_authorization_required" : "gate_missing",
    );
  }
  if (projection.execution === "completed") return stopped(projection, "complete", null, "complete");

  if (projection.execution === "not-started") {
    let transitionTimestamp: EvidenceTimestamp | null = null;
    try {
      transitionTimestamp = timestamp(dependencies.now());
    } catch {
      transitionTimestamp = null;
    }
    if (transitionTimestamp === null) {
      return stopped(projection, "blocked", "coulson", "journal_unavailable");
    }
    const entry: ProfileAwareMissionEntryV1 = {
      schemaVersion: 9,
      entryId: `entry:${input.missionId}:${input.expectedSequence + 1}`,
      missionId: input.missionId,
      sequence: input.expectedSequence + 1,
      type: "execution.transition",
      timestamp: transitionTimestamp,
      payload: { from: "not-started", to: "running" },
    };
    let append: MissionJournalAppendResultV1 | null;
    try {
      append = appendResult(await dependencies.appendJournal({
        repositoryRoot: input.repositoryRoot,
        configuredJournalPath: input.configuredJournalPath,
        missionId: input.missionId,
        entry,
      }));
    } catch {
      return stopped(projection, "blocked", "coulson", "journal_unavailable");
    }
    if (append === null) {
      return stopped(projection, "blocked", "coulson", "journal_unavailable");
    }
    if (append.state !== "appended") {
      return stopped(projection, "blocked", "coulson", append.code);
    }
    const reread = await readValidated(input, dependencies);
    if (reread === null ||
        canonicalJson(reread.entries[input.expectedSequence + 1]) !== canonicalJson(entry) ||
        reread.projection.execution !== "running" ||
        reread.projection.lastSequence !== input.expectedSequence + 1) {
      return stopped(projection, "blocked", "coulson", "transition_readback_mismatch");
    }
    snapshot = reread;
    projection = reread.projection;
    runningSequence = input.expectedSequence + 1;
  }
  if (projection.execution !== "running" || projection.lastSequence !== runningSequence) {
    return stopped(projection, "blocked", "coulson", "stale_sequence");
  }

  const plan: RunnerCyclePlan = {
    runnerContractVersion: 1,
    cycleId: identity.cycleId,
    missionId: input.missionId,
    subjectId: projection.brief.subjectId,
    revisionId: input.expectedRevisionId,
    evaluatedThroughSequence: runningSequence,
    seatId: input.seatId,
    activatedModes: input.activatedModes.map((mode) => ({ ...mode })),
    actionId: input.actionId,
    effectClass: input.effectClass,
    effectKey: identity.effectKey,
    validationId: input.validationId,
    stopCondition: "after_one_cycle",
  };
  const permissionContext = async (): Promise<PermissionInvocationContext> => {
    const raw = await dependencies.getPermissionContext(plan, identity.decisionId);
    const checked = validatePermissionInvocationContext(raw);
    if (checked.state === "invalid" ||
        checked.value.decisionId !== identity.decisionId ||
        checked.value.journalSchemaVersion !== 9 ||
        !sameCapabilities(checked.value.requiredCapabilities, dependencies.requiredCapabilities(plan))) {
      throw new Error("permission_context_malformed");
    }
    return checked.value;
  };
  const authorize = createPermissionAuthorizer({
    ledgerId: dependencies.permissionAudit.ledgerId,
    appendIfAbsent: dependencies.permissionAudit.appendIfAbsent,
    getContext: permissionContext,
  });
  const claimed = createRuntimeClaimedExecutorV1({
    ledgerId: dependencies.permissionAudit.ledgerId,
    appendIfAbsent: dependencies.permissionAudit.appendIfAbsent,
    getContext: permissionContext,
    execute: dependencies.executeTool,
    now: () => {
      const current = timestamp(dependencies.now());
      if (current === null) throw new Error("clock_malformed");
      return current.value;
    },
  });
  phase.postClaim = true;
  const runner = await runRunnerCycle({
    runnerContractVersion: 1,
    projection: runnerProjection(projection),
    resolvedModeContext: {
      runnerContractVersion: 1,
      seatId: input.seatId,
      modes: input.activatedModes.map((mode) => ({ ...mode })),
    },
    actionAllowlist: [...input.actionAllowlist],
    plan,
  }, {
    authorize,
    claim: claimed.claim,
    execute: claimed.execute,
    validate: dependencies.validate,
  });
  if (runner.state === "invalid") {
    return stopped(projection, "blocked", "coulson", "effect_readback_mismatch");
  }
  if (runner.value.outcome === "stopped" && runner.value.effectRecordCandidate === null) {
    return preDispatchOutcome(projection, runner.value.reason, input.seatId);
  }
  const candidate = runner.value.effectRecordCandidate;
  if (candidate === null) return stopped(projection, "blocked", "coulson", "effect_readback_mismatch");
  let effectEntry: ProfileAwareMissionEntryV1;
  try {
    const effectTimestamp = timestamp(dependencies.now());
    if (effectTimestamp === null) throw new Error("clock_malformed");
    effectEntry = createProfileAwareExecutionEffectEntryV1({
      projection,
      candidate,
      timestamp: effectTimestamp,
    });
  } catch {
    return stopped(projection, "uncertain", "coulson", "effect_readback_mismatch");
  }
  let effectAppend: MissionJournalAppendResultV1 | null;
  try {
    effectAppend = appendResult(await dependencies.appendJournal({
      repositoryRoot: input.repositoryRoot,
      configuredJournalPath: input.configuredJournalPath,
      missionId: input.missionId,
      entry: effectEntry,
    }));
  } catch {
    return stopped(projection, "uncertain", "coulson", "journal_unavailable");
  }
  if (effectAppend === null) {
    return stopped(projection, "uncertain", "coulson", "effect_readback_mismatch");
  }
  if (effectAppend.state !== "appended") {
    return stopped(projection, "uncertain", "coulson", effectAppend.code);
  }
  const readback = await readValidated(input, dependencies);
  const recorded = readback?.projection.effects.filter(({ effectKey }) => effectKey === identity.effectKey) ?? [];
  if (readback === null ||
      effectEntry.entryId !== `entry:${input.missionId}:${runningSequence + 1}` ||
      canonicalJson(readback.entries[runningSequence + 1]) !== canonicalJson(effectEntry) ||
      readback.projection.lastSequence !== runningSequence + 1 ||
      recorded.length !== 1 ||
      exactEffect(readback.projection, identity, input) !== candidate.payload.outcome ||
      readback.journalDigest === snapshot.journalDigest) {
    return stopped(projection, "uncertain", "coulson", "effect_readback_mismatch");
  }
  if (candidate.payload.outcome === "uncertain") {
    return stopped(readback.projection, "uncertain", "coulson", candidate.payload.reasonCode as RunnerStopReason);
  }
  return {
    outcome: "advanced",
    missionId: readback.projection.missionId,
    subjectId: readback.projection.brief.subjectId,
    revisionId: readback.projection.brief.revisionId,
    sequence: readback.projection.lastSequence,
    accountableNextSeat: "hill",
    cycleId: identity.cycleId,
    effectKey: identity.effectKey,
  };
}

export async function runMissionCycle(
  inputValue: unknown,
  dependenciesValue: MissionCycleDependenciesV1,
): Promise<MissionCycleResultV1> {
  const identity = inspectIdentityEnvelope(inputValue);
  if (identity === null) return unboundInputInvalid();
  const input = validateAndFreezeInput(inputValue);
  const dependencies = validateAndFreezeDependencies(dependenciesValue);
  if (input === null || dependencies === null) return boundInputInvalid(identity);
  const phase = { postClaim: false };
  try {
    return await runMissionCycleValidated(input, dependencies, phase);
  } catch {
    return {
      outcome: phase.postClaim ? "uncertain" : "blocked",
      missionId: identity.missionId,
      subjectId: identity.expectedSubjectId,
      revisionId: identity.expectedRevisionId,
      sequence: identity.expectedSequence,
      accountableNextSeat: "coulson",
      reasonCode: phase.postClaim ? "effect_readback_mismatch" : "journal_unavailable",
    };
  }
}
