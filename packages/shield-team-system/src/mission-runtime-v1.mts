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
      subjectId: string | null;
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
    const snapshot = await dependencies.readJournal({
      repositoryRoot: input.repositoryRoot,
      configuredJournalPath: input.configuredJournalPath,
      missionId: input.missionId,
    });
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

export async function runMissionCycle(
  input: MissionCycleInputV1,
  dependencies: MissionCycleDependenciesV1,
): Promise<MissionCycleResultV1> {
  let snapshot = await readValidated(input, dependencies);
  if (snapshot === null) {
    return {
      outcome: "blocked",
      missionId: input.missionId,
      subjectId: null,
      revisionId: input.expectedRevisionId,
      sequence: input.expectedSequence,
      accountableNextSeat: "coulson",
      reasonCode: "journal_unavailable",
    };
  }
  let projection = snapshot.projection;
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
    const entry: ProfileAwareMissionEntryV1 = {
      schemaVersion: 9,
      entryId: `entry:${input.missionId}:${input.expectedSequence + 1}`,
      missionId: input.missionId,
      sequence: input.expectedSequence + 1,
      type: "execution.transition",
      timestamp: dependencies.now(),
      payload: { from: "not-started", to: "running" },
    };
    let append: MissionJournalAppendResultV1;
    try {
      append = await dependencies.appendJournal({
        repositoryRoot: input.repositoryRoot,
        configuredJournalPath: input.configuredJournalPath,
        missionId: input.missionId,
        entry,
      });
    } catch {
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
    now: () => dependencies.now().value,
  });
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
    effectEntry = createProfileAwareExecutionEffectEntryV1({
      projection,
      candidate,
      timestamp: dependencies.now(),
    });
  } catch {
    return stopped(projection, "uncertain", "coulson", "effect_readback_mismatch");
  }
  let effectAppend: MissionJournalAppendResultV1;
  try {
    effectAppend = await dependencies.appendJournal({
      repositoryRoot: input.repositoryRoot,
      configuredJournalPath: input.configuredJournalPath,
      missionId: input.missionId,
      entry: effectEntry,
    });
  } catch {
    return stopped(projection, "uncertain", "coulson", "journal_unavailable");
  }
  if (effectAppend.state !== "appended") {
    return stopped(projection, "uncertain", "coulson", effectAppend.code);
  }
  const readback = await readValidated(input, dependencies);
  const recorded = readback?.projection.effects.filter(({ effectKey }) => effectKey === identity.effectKey) ?? [];
  if (readback === null ||
      canonicalJson(readback.entries[runningSequence + 1]) !== canonicalJson(effectEntry) ||
      readback.projection.lastSequence !== runningSequence + 1 ||
      recorded.length !== 1 ||
      recorded[0].cycleId !== identity.cycleId ||
      recorded[0].authorizationDecisionId !== identity.decisionId ||
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
