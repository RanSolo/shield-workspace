import { createHash } from "node:crypto";
import { realpath as fsRealpath } from "node:fs/promises";
import { execFile as execFileNode } from "node:child_process";
import { resolve } from "node:path";
import { types as utilTypes } from "node:util";

import { canonicalJson } from "./mission-v2.mjs";
import { readMissionJournalForDisplay } from "./mission-store.mjs";
import {
  assertAuthoritySubsetOfScope,
  computeImplementationAuthorityDigest,
  computeSchema9RuntimeBindingDigest,
  validateImplementationAuthorityV1,
  validateSchema9RuntimeBindingV1,
  type ImplementationAuthorityV1,
  type Schema9RuntimeBindingV1,
} from "./implementation-authority-v1.mjs";
import {
  DAISY_COORDINATION_ACTION_ID,
  DAISY_COORDINATION_CAPABILITY_CLASS,
  DAISY_COORDINATION_EFFECT_CLASS,
  DAISY_COORDINATION_VALIDATION_ID,
  computeDaisyCoordinationAuthorityDigest,
  computeDaisyCoordinationRuntimeBindingDigest,
  validateDaisyCoordinationAuthorityV1,
  validateDaisyCoordinationRuntimeBindingV1,
  type DaisyCoordinationAuthorityV1,
  type DaisyCoordinationRuntimeBindingV1,
} from "./daisy-coordination-authority-v1.mjs";
import { validateRunnerCyclePlan, type RunnerCyclePlan } from "./runner-v1.mjs";
import {
  type ProfileAwareMissionEntryV1,
  type ProfileAwareProjectionV1,
  type ProfileAwareProjectionWithDaisyCoordinationV1,
  type ProfileEvidenceV1,
  type ProfileRequirementV1,
} from "./profile-aware-mission-v1.mjs";

export const SCHEMA9_SEAT_DISPATCH_PROJECTION_CONTRACT_VERSION = "schema9-seat-dispatch-projection.v1" as const;
export const SCHEMA9_SEAT_DISPATCH_PROJECTION_PURPOSES = ["specialist_dispatch", "runner_permission"] as const;
export type Schema9SeatDispatchProjectionPurposeV1 = (typeof SCHEMA9_SEAT_DISPATCH_PROJECTION_PURPOSES)[number];

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/;

type HostRealpath = (path: string) => Promise<string>;
type HostExecFile = (command: string, args: readonly string[], options: { cwd: string }) => Promise<string>;

export interface Schema9SeatDispatchProjectionTrustedHostOpsV1 {
  realpath(path: string): Promise<string>;
  execFile(command: string, args: readonly string[], options: { cwd: string }): Promise<string>;
}

export interface Schema9SeatDispatchProjectionInputV1 {
  purpose: Schema9SeatDispatchProjectionPurposeV1;
  repositoryRoot: string;
  configuredJournalPath: string;
  missionId: string;
  expectedSubjectId: string;
  expectedMissionRevisionId: string;
  expectedEvaluatedThroughSequence: number;
  plan?: RunnerCyclePlan;
  trustedHostOps: Partial<Schema9SeatDispatchProjectionTrustedHostOpsV1>;
}

export interface Schema9SeatDispatchRepositoryObservationV1 {
  canonicalRoot: string;
  branch: string;
  headRevision: string;
}

export interface Schema9SeatDispatchSatisfiedExecutionGateV1 {
  requirementId: string;
  requiredRoleId: "coulson" | "fitz" | "simmons";
  evidenceKind: "mission_authorization" | "technical_review" | "product_domain_review" | "final_acceptance";
  evidenceId: string;
  evidenceSourceRef: string;
  evidenceJournalSequence: number;
}

interface Schema9SeatDispatchProjectionCommonV1 {
  contractVersion: typeof SCHEMA9_SEAT_DISPATCH_PROJECTION_CONTRACT_VERSION;
  purpose: Schema9SeatDispatchProjectionPurposeV1;
  projectionDigest: string;
  journalSchemaVersion: 9;
  journalDigest: string;
  missionId: string;
  subjectId: string;
  missionRevisionId: string;
  artifactRevisionId: string;
  evaluatedThroughSequence: number;
  missionAuthorization: {
    state: "authorized";
    evidence: ProfileEvidenceV1;
  };
  profile: {
    profileId: ProfileAwareProjectionV1["brief"]["profileId"];
    profileVersion: 1;
    requirementsDigest: string;
    executionReadiness: "ready";
    satisfiedExecutionGates: Schema9SeatDispatchSatisfiedExecutionGateV1[];
  };
  lifecycle: {
    execution: "not-started" | "running";
    finalAcceptance: "waiting";
  };
}

export interface Schema9MaySeatDispatchProjectionV1 extends Schema9SeatDispatchProjectionCommonV1 {
  implementationAuthority: {
    digest: string;
    authority: ImplementationAuthorityV1;
  };
  mayRuntimeBinding: {
    digest: string;
    binding: Schema9RuntimeBindingV1;
  };
  repositoryObservations: [Schema9SeatDispatchRepositoryObservationV1, Schema9SeatDispatchRepositoryObservationV1];
  authorityPath: "explicit_wheels_up";
  materialGateDisposition: "not_applicable_explicit_authority";
}

export interface Schema9DaisySeatDispatchProjectionV1 extends Schema9SeatDispatchProjectionCommonV1 {
  daisyCoordinationAuthority: {
    digest: string;
    sequence: number;
    authority: DaisyCoordinationAuthorityV1;
  };
  daisyRuntimeBinding: {
    digest: string;
    binding: DaisyCoordinationRuntimeBindingV1;
  };
  repositoryObservations: [Schema9SeatDispatchRepositoryObservationV1, Schema9SeatDispatchRepositoryObservationV1];
  authorityPath: "daisy_feature_flight_coordination";
  materialGateDisposition: "not_applicable_explicit_authority";
}

export type Schema9SeatDispatchProjectionV1 =
  | Schema9MaySeatDispatchProjectionV1
  | Schema9DaisySeatDispatchProjectionV1;

export type Schema9SeatDispatchProjectionBlockedCodeV1 =
  | "input_invalid"
  | "schema_unsupported"
  | "journal_invalid"
  | "mission_mismatch"
  | "revision_mismatch"
  | "sequence_mismatch"
  | "authorization_inactive"
  | "profile_not_ready"
  | "lifecycle_inactive"
  | "authority_missing"
  | "authority_inactive"
  | "binding_missing"
  | "binding_ambiguous"
  | "binding_invalid"
  | "observation_failed"
  | "journal_drift"
  | "root_mismatch"
  | "branch_mismatch"
  | "head_mismatch";

export type Schema9SeatDispatchProjectionResultV1 =
  | { state: "ready"; projection: Schema9SeatDispatchProjectionV1 }
  | { state: "blocked"; code: Schema9SeatDispatchProjectionBlockedCodeV1; errors: string[] };

type ProjectionBlockedResult = Extract<Schema9SeatDispatchProjectionResultV1, { state: "blocked" }>;

interface InputSnapshot {
  purpose: Schema9SeatDispatchProjectionPurposeV1;
  repositoryRoot: string;
  configuredJournalPath: string;
  missionId: string;
  expectedSubjectId: string;
  expectedMissionRevisionId: string;
  expectedEvaluatedThroughSequence: number;
  plan: RunnerCyclePlan | null;
  ops: Schema9SeatDispatchProjectionTrustedHostOpsV1;
}

interface RepositoryObservationInternal extends Schema9SeatDispatchRepositoryObservationV1 {
  lexicalRequestedRoot: string;
  requestedRoot: string;
  lexicalTopLevelRoot: string;
}

interface MayReplaySnapshot {
  projection: ProfileAwareProjectionV1;
  journalDigest: string;
  missionAuthorization: ProfileEvidenceV1;
  satisfiedExecutionGates: Schema9SeatDispatchSatisfiedExecutionGateV1[];
  requirementsDigest: string;
  authority: ImplementationAuthorityV1;
  authorityDigest: string;
  binding: Schema9RuntimeBindingV1;
  bindingDigest: string;
}

interface DaisyReplaySnapshot {
  projection: ProfileAwareProjectionV1;
  journalDigest: string;
  missionAuthorization: ProfileEvidenceV1;
  satisfiedExecutionGates: Schema9SeatDispatchSatisfiedExecutionGateV1[];
  requirementsDigest: string;
  daisyAuthority: DaisyCoordinationAuthorityV1;
  daisyAuthorityDigest: string;
  daisyAuthoritySequence: number;
  daisyBinding: DaisyCoordinationRuntimeBindingV1;
  daisyBindingDigest: string;
}

type ReplaySnapshot = MayReplaySnapshot | DaisyReplaySnapshot;

const defaultHostOps: Schema9SeatDispatchProjectionTrustedHostOpsV1 = {
  realpath: (path: string): Promise<string> => fsRealpath(path),
  execFile: (command: string, args: readonly string[], options: { cwd: string }): Promise<string> => new Promise((resolvePromise, reject) => {
    execFileNode(command, [...args], {
      ...options,
      encoding: "utf8",
      windowsHide: true,
      env: { LANG: "C", LC_ALL: "C", PATH: process.env.PATH ?? "" },
    }, (error, stdout) => {
      if (error) return reject(error);
      resolvePromise(stdout.toString());
    });
  }),
};

function blocked(code: Schema9SeatDispatchProjectionBlockedCodeV1, errors: string[]): ProjectionBlockedResult {
  return { state: "blocked", code, errors: [...errors] };
}

function plain(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !utilTypes.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function dataField(record: Record<string, unknown>, key: string): { state: "valid"; value: unknown } | { state: "invalid" } {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor?.enumerable === true && Object.hasOwn(descriptor, "value")
    ? { state: "valid", value: descriptor.value }
    : { state: "invalid" };
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function identifier(value: unknown): value is string {
  return typeof value === "string" && IDENTIFIER.test(value);
}

function digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("base64url")}`;
}

function jsonCopy<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}

function snapshotInput(input: unknown): { state: "ready"; value: InputSnapshot } | { state: "blocked"; code: "input_invalid"; errors: string[] } {
  if (!plain(input)) return { state: "blocked", code: "input_invalid", errors: ["Schema-9 seat-dispatch projection input must be a non-proxy plain object."] };
  const requiredFields = [
    "purpose",
    "repositoryRoot",
    "configuredJournalPath",
    "missionId",
    "expectedSubjectId",
    "expectedMissionRevisionId",
    "expectedEvaluatedThroughSequence",
    "trustedHostOps",
  ];
  const hasPlan = Object.hasOwn(input, "plan");
  const fields = hasPlan ? [...requiredFields, "plan"] : requiredFields;
  const keys = Reflect.ownKeys(input);
  if (keys.length !== fields.length || keys.some((key) => typeof key !== "string" || !fields.includes(key))) {
    return { state: "blocked", code: "input_invalid", errors: ["Schema-9 seat-dispatch projection input is not closed."] };
  }
  for (const field of fields) {
    if (dataField(input, field).state === "invalid") {
      return { state: "blocked", code: "input_invalid", errors: [`Schema-9 seat-dispatch projection field ${field} must be enumerable data.`] };
    }
  }
  const field = (key: string): unknown => (dataField(input, key) as { state: "valid"; value: unknown }).value;
  const repositoryRoot = normalizeString(field("repositoryRoot"));
  const purpose = field("purpose");
  const configuredJournalPath = normalizeString(field("configuredJournalPath"));
  const missionId = normalizeString(field("missionId"));
  const expectedSubjectId = normalizeString(field("expectedSubjectId"));
  const expectedMissionRevisionId = normalizeString(field("expectedMissionRevisionId"));
  const expectedEvaluatedThroughSequence = field("expectedEvaluatedThroughSequence");
  const checkedPlan = hasPlan ? validateRunnerCyclePlan(field("plan")) : null;
  if (purpose !== "specialist_dispatch" && purpose !== "runner_permission") {
    return { state: "blocked", code: "input_invalid", errors: ["Schema-9 projection purpose must be specialist_dispatch or runner_permission."] };
  }
  if (repositoryRoot.length === 0 || configuredJournalPath.length === 0 || !identifier(missionId) || !identifier(expectedSubjectId) || !identifier(expectedMissionRevisionId)) {
    return { state: "blocked", code: "input_invalid", errors: ["Schema-9 seat-dispatch projection paths and exact identity fields are invalid."] };
  }
  if (!Number.isSafeInteger(expectedEvaluatedThroughSequence) || (expectedEvaluatedThroughSequence as number) < 0) {
    return { state: "blocked", code: "input_invalid", errors: ["Schema-9 seat-dispatch projection sequence must be a non-negative safe integer."] };
  }
  if (checkedPlan?.state === "invalid") {
    return { state: "blocked", code: "input_invalid", errors: ["Schema-9 seat-dispatch plan is malformed.", ...checkedPlan.errors] };
  }
  const plan = checkedPlan?.state === "valid" ? jsonCopy(checkedPlan.value) : null;
  if (plan !== null) {
    if (plan.missionId !== missionId || plan.subjectId !== expectedSubjectId || plan.revisionId !== expectedMissionRevisionId ||
        plan.evaluatedThroughSequence !== expectedEvaluatedThroughSequence) {
      return { state: "blocked", code: "input_invalid", errors: ["Schema-9 seat-dispatch plan is not exact-bound to the requested mission identity and sequence."] };
    }
    const exactDaisyPlan = plan.seatId === "daisy" && plan.actionId === DAISY_COORDINATION_ACTION_ID &&
      plan.effectClass === DAISY_COORDINATION_EFFECT_CLASS && plan.validationId === DAISY_COORDINATION_VALIDATION_ID;
    if (plan.seatId !== "may" && !exactDaisyPlan) {
      return { state: "blocked", code: "input_invalid", errors: ["Schema-9 seat-dispatch supports only May or the exact Daisy coordination tuple."] };
    }
  }
  const opsInput = field("trustedHostOps");
  if (!plain(opsInput)) return { state: "blocked", code: "input_invalid", errors: ["Schema-9 seat-dispatch trusted host operations must be a non-proxy plain object."] };
  const opKeys = Reflect.ownKeys(opsInput);
  if (opKeys.some((key) => typeof key !== "string" || (key !== "realpath" && key !== "execFile"))) {
    return { state: "blocked", code: "input_invalid", errors: ["Schema-9 seat-dispatch trusted host operations are not closed."] };
  }
  const ops: Schema9SeatDispatchProjectionTrustedHostOpsV1 = { ...defaultHostOps };
  for (const key of ["realpath", "execFile"] as const) {
    const descriptor = dataField(opsInput, key);
    if (descriptor.state === "invalid") {
      if (Object.hasOwn(opsInput, key)) return { state: "blocked", code: "input_invalid", errors: [`Schema-9 seat-dispatch host operation ${key} must be enumerable data.`] };
      continue;
    }
    if (typeof descriptor.value !== "function") return { state: "blocked", code: "input_invalid", errors: [`Schema-9 seat-dispatch host operation ${key} must be a function.`] };
    if (key === "realpath") ops.realpath = descriptor.value as HostRealpath;
    else ops.execFile = descriptor.value as HostExecFile;
  }
  return {
    state: "ready",
    value: {
      purpose,
      repositoryRoot,
      configuredJournalPath,
      missionId,
      expectedSubjectId,
      expectedMissionRevisionId,
      expectedEvaluatedThroughSequence: expectedEvaluatedThroughSequence as number,
      plan,
      ops,
    },
  };
}

async function runGitValue(ops: Schema9SeatDispatchProjectionTrustedHostOpsV1, cwd: string, args: readonly string[]): Promise<string> {
  const value = await ops.execFile("git", ["-C", cwd, ...args], { cwd });
  return normalizeString(value).split("\n")[0] ?? "";
}

async function observeRepository(ops: Schema9SeatDispatchProjectionTrustedHostOpsV1, repositoryRoot: string): Promise<RepositoryObservationInternal> {
  const lexicalRequestedRoot = resolve(repositoryRoot);
  const requestedRoot = await ops.realpath(lexicalRequestedRoot);
  const top = await runGitValue(ops, requestedRoot, ["rev-parse", "--show-toplevel"]);
  const branch = await runGitValue(ops, requestedRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const headRevision = await runGitValue(ops, requestedRoot, ["rev-parse", "HEAD"]);
  if (top.length === 0) throw new Error("missing_top_level");
  if (branch.length === 0 || branch === "HEAD") throw new Error("detached_head");
  if (headRevision.length === 0) throw new Error("missing_head");
  const lexicalTopLevelRoot = resolve(top);
  const canonicalRoot = await ops.realpath(lexicalTopLevelRoot);
  return { lexicalRequestedRoot, requestedRoot, lexicalTopLevelRoot, canonicalRoot, branch, headRevision };
}

function validateReplay(snapshot: InputSnapshot, read: { projection: ProfileAwareProjectionV1; entries: ProfileAwareMissionEntryV1[] }): { state: "ready"; value: ReplaySnapshot } | Exclude<Schema9SeatDispatchProjectionResultV1, { state: "ready" }> {
  const projection = read.projection;
  if (projection.missionId !== snapshot.missionId || projection.brief.subjectId !== snapshot.expectedSubjectId) {
    return blocked("mission_mismatch", ["Journal mission and subject do not exact-match the expected identity."]);
  }
  if (projection.brief.revisionId !== snapshot.expectedMissionRevisionId) {
    return blocked("revision_mismatch", ["Journal mission revision does not exact-match the expected revision."]);
  }
  if (projection.lastSequence !== snapshot.expectedEvaluatedThroughSequence) {
    return blocked("sequence_mismatch", ["Journal sequence does not exact-match the expected sequence."]);
  }
  if (projection.authorization !== "authorized") return blocked("authorization_inactive", ["Signed Coulson mission authorization is not active."]);
  if (projection.finalAcceptance !== "waiting") {
    return blocked("lifecycle_inactive", ["Projection requires final acceptance to remain waiting."]);
  }
  if (snapshot.purpose === "specialist_dispatch" && projection.execution !== "not-started") {
    return blocked("lifecycle_inactive", ["Specialist dispatch requires a nonterminal not-started mission."]);
  }
  if (snapshot.purpose === "runner_permission" && projection.execution !== "not-started" && projection.execution !== "running") {
    return blocked("lifecycle_inactive", ["Runner permission requires a nonterminal not-started or running mission."]);
  }
  if (projection.readiness.execute !== "ready") return blocked("profile_not_ready", ["Profile execution readiness is not ready."]);

  const authorizationRequirements = projection.requirements.filter((requirement) => requirement.phase === "authorization" && requirement.evidenceKind === "mission_authorization" && requirement.requiredRoleId === "coulson");
  if (authorizationRequirements.length !== 1) return blocked("authorization_inactive", ["The Coulson mission-authorization requirement is absent or ambiguous."]);
  const authorizationEvidence = projection.evidence.filter((evidence) => evidence.requirementId === authorizationRequirements[0].requirementId);
  if (authorizationEvidence.length !== 1) return blocked("authorization_inactive", ["Signed Coulson mission-authorization evidence is absent or ambiguous."]);

  const executionRequirements = projection.requirements.filter((requirement) => requirement.phase === "execution");
  const satisfiedExecutionGates: Schema9SeatDispatchSatisfiedExecutionGateV1[] = [];
  for (const requirement of executionRequirements) {
    const matches = projection.evidence.filter((evidence) => evidence.requirementId === requirement.requirementId);
    if (matches.length !== 1) return blocked("profile_not_ready", [`Execution gate ${requirement.requirementId} is absent or ambiguous.`]);
    const evidence = matches[0];
    if (evidence.missionId !== projection.missionId || evidence.revisionId !== projection.brief.revisionId || evidence.seatId !== requirement.requiredRoleId || evidence.evidenceKind !== requirement.evidenceKind) {
      return blocked("profile_not_ready", [`Execution gate ${requirement.requirementId} is not exact-bound to its profile requirement.`]);
    }
    satisfiedExecutionGates.push({
      requirementId: requirement.requirementId,
      requiredRoleId: requirement.requiredRoleId,
      evidenceKind: requirement.evidenceKind,
      evidenceId: evidence.evidenceId,
      evidenceSourceRef: evidence.sourceRef,
      evidenceJournalSequence: evidence.journalSequence,
    });
  }

  if (snapshot.plan?.seatId === "daisy") {
    if (!Object.hasOwn(projection, "daisyCoordinationAuthority")) return blocked("authority_missing", ["Active Daisy coordination authority is missing."]);
    const daisyProjection = projection as ProfileAwareProjectionWithDaisyCoordinationV1;
    if (daisyProjection.daisyCoordinationAuthorityState !== "authorized") return blocked("authority_inactive", ["Daisy coordination authority is not active."]);
    const checkedAuthority = validateDaisyCoordinationAuthorityV1(daisyProjection.daisyCoordinationAuthority);
    if (checkedAuthority.state === "invalid") return blocked("authority_inactive", ["Daisy coordination authority is malformed.", ...checkedAuthority.errors]);
    const daisyAuthority = jsonCopy(checkedAuthority.value);
    const daisyAuthorityDigest = computeDaisyCoordinationAuthorityDigest(daisyAuthority);
    if (daisyProjection.daisyCoordinationAuthorityDigest !== daisyAuthorityDigest || daisyProjection.daisyCoordinationAuthoritySequence < 1) {
      return blocked("authority_inactive", ["Daisy coordination authority digest or sequence is not current."]);
    }
    if (daisyAuthority.missionId !== projection.missionId || daisyAuthority.subjectId !== projection.brief.subjectId ||
        daisyAuthority.missionRevisionId !== projection.brief.revisionId || daisyAuthority.evaluatedThroughSequence !== daisyProjection.daisyCoordinationAuthoritySequence - 1) {
      return blocked("authority_inactive", ["Daisy coordination authority is not exact-bound to the mission identity and issuance sequence."]);
    }
    if (snapshot.plan.actionId !== daisyAuthority.actionId || snapshot.plan.effectClass !== daisyAuthority.effectClass ||
        snapshot.plan.effectKey !== daisyAuthority.effectKey || snapshot.plan.validationId !== DAISY_COORDINATION_VALIDATION_ID) {
      return blocked("authority_inactive", ["Daisy Runner plan does not exact-match coordination authority scope."]);
    }
    const active = daisyProjection.activeDaisyRuntimeBindings;
    if (active.length === 0) return blocked("binding_missing", ["No active Daisy coordination runtime binding exists."]);
    if (active.length > 1) return blocked("binding_ambiguous", ["More than one active Daisy coordination runtime binding exists."]);
    const checkedBinding = validateDaisyCoordinationRuntimeBindingV1(active[0]);
    if (checkedBinding.state === "invalid") return blocked("binding_invalid", ["Active Daisy coordination runtime binding is malformed.", ...checkedBinding.errors]);
    const daisyBinding = jsonCopy(checkedBinding.value);
    if (daisyBinding.authorityRef !== daisyAuthority.authorityRef || daisyBinding.authorityDigest !== daisyAuthorityDigest ||
        daisyBinding.authoritySequence !== daisyProjection.daisyCoordinationAuthoritySequence ||
        daisyBinding.missionId !== projection.missionId || daisyBinding.subjectId !== projection.brief.subjectId ||
        daisyBinding.missionRevisionId !== projection.brief.revisionId || daisyBinding.seatId !== "daisy") {
      return blocked("binding_invalid", ["Active Daisy coordination binding is not exact-bound to its authority and mission."]);
    }
    if (daisyBinding.actionId !== snapshot.plan.actionId || daisyBinding.effectClass !== snapshot.plan.effectClass ||
        daisyBinding.effectKey !== snapshot.plan.effectKey || daisyBinding.capabilityClass !== DAISY_COORDINATION_CAPABILITY_CLASS) {
      return blocked("binding_invalid", ["Active Daisy coordination binding does not exact-match the Runner tuple."]);
    }
    if (daisyBinding.repositoryId !== daisyAuthority.repositoryId || daisyBinding.canonicalRepositoryRoot !== daisyAuthority.canonicalRepositoryRoot ||
        daisyBinding.branch !== daisyAuthority.branch || daisyBinding.headRevision !== daisyAuthority.headRevision ||
        daisyBinding.durableArtifactRoot !== daisyAuthority.durableArtifactRoot) {
      return blocked("binding_invalid", ["Active Daisy coordination binding repository or artifact root does not mirror authority."]);
    }
    return {
      state: "ready",
      value: {
        projection,
        journalDigest: digest(read.entries),
        missionAuthorization: jsonCopy(authorizationEvidence[0]),
        satisfiedExecutionGates,
        requirementsDigest: digest(projection.requirements as ProfileRequirementV1[]),
        daisyAuthority,
        daisyAuthorityDigest,
        daisyAuthoritySequence: daisyProjection.daisyCoordinationAuthoritySequence,
        daisyBinding,
        daisyBindingDigest: computeDaisyCoordinationRuntimeBindingDigest(daisyBinding),
      },
    };
  }

  if (projection.implementationAuthority === null) return blocked("authority_missing", ["Active implementation authority is missing."]);
  if (projection.implementationAuthorityState !== "authorized") return blocked("authority_inactive", ["Implementation authority is not active."]);
  const checkedAuthority = validateImplementationAuthorityV1(projection.implementationAuthority);
  if (checkedAuthority.state === "invalid") return blocked("authority_inactive", ["Implementation authority is malformed.", ...checkedAuthority.errors]);
  const authority = jsonCopy(checkedAuthority.value);
  const authorityDigest = computeImplementationAuthorityDigest(authority);
  if (projection.implementationAuthorityDigest !== authorityDigest || authority.authorityKind !== "wheels_up" || authority.seatId !== "may") {
    return blocked("authority_inactive", ["Implementation authority identity, kind, or digest is not current."]);
  }
  if (authority.missionId !== projection.missionId || authority.subjectId !== projection.brief.subjectId || authority.missionRevisionId !== projection.brief.revisionId) {
    return blocked("authority_inactive", ["Implementation authority is not exact-bound to the mission identity."]);
  }

  const mayBindings = projection.activeRuntimeBindings.filter((candidate) => candidate.binding.seatId === "may");
  if (mayBindings.length === 0) return blocked("binding_missing", ["No active May runtime binding exists."]);
  if (mayBindings.length > 1) return blocked("binding_ambiguous", ["More than one active May runtime binding exists."]);
  const checkedBinding = validateSchema9RuntimeBindingV1(mayBindings[0]);
  if (checkedBinding.state === "invalid") return blocked("binding_invalid", ["Active May runtime binding is malformed.", ...checkedBinding.errors]);
  const binding = jsonCopy(checkedBinding.value);
  if (binding.implementationAuthorityRef !== authority.authorityRef || binding.implementationAuthoritySequence !== authority.journalSequence || binding.implementationAuthorityDigest !== authorityDigest) {
    return blocked("binding_invalid", ["Active May binding does not reference the active implementation authority exactly."]);
  }
  const subset = assertAuthoritySubsetOfScope(binding, authority);
  if (subset.state === "invalid") return blocked("binding_invalid", [...subset.errors]);
  if (binding.binding.missionId !== projection.missionId || binding.binding.subjectId !== projection.brief.subjectId || binding.binding.missionRevisionId !== projection.brief.revisionId || binding.binding.seatId !== "may") {
    return blocked("binding_invalid", ["Active May binding is not exact-bound to the mission identity."]);
  }
  if (binding.binding.lifecycleState !== "active" || binding.binding.activeThroughSequence !== null) return blocked("binding_invalid", ["May runtime binding is not active and open-ended."]);
  if (binding.binding.repositoryId !== authority.repositoryId || binding.binding.canonicalWritableRoot !== authority.canonicalWritableRoot || binding.binding.branch !== authority.branch) {
    return blocked("binding_invalid", ["May binding repository identity does not mirror implementation authority."]);
  }
  if (binding.binding.artifactRevisionId !== authority.artifactRevisionId || binding.baseRevision !== authority.baseRevision || binding.headRevision !== authority.headRevision) {
    return blocked("revision_mismatch", ["May binding revisions do not exact-match implementation authority."]);
  }
  if (new Set([authority.artifactRevisionId, authority.headRevision, binding.binding.artifactRevisionId, binding.headRevision]).size !== 1) {
    return blocked("authority_inactive", ["Authority, binding, artifact, and HEAD revisions are not invariant."]);
  }

  return {
    state: "ready",
    value: {
      projection,
      journalDigest: digest(read.entries),
      missionAuthorization: jsonCopy(authorizationEvidence[0]),
      satisfiedExecutionGates,
      requirementsDigest: digest(projection.requirements as ProfileRequirementV1[]),
      authority,
      authorityDigest,
      binding,
      bindingDigest: computeSchema9RuntimeBindingDigest(binding),
    },
  };
}

function checkObservation(observation: RepositoryObservationInternal, replay: ReplaySnapshot): Exclude<Schema9SeatDispatchProjectionResultV1, { state: "ready" }> | null {
  if (observation.lexicalRequestedRoot !== observation.requestedRoot || observation.lexicalTopLevelRoot !== observation.canonicalRoot || observation.requestedRoot !== observation.canonicalRoot) {
    return blocked("root_mismatch", ["Repository root aliases and non-top-level roots are not permitted."]);
  }
  if ("daisyAuthority" in replay) {
    if (observation.canonicalRoot !== replay.daisyAuthority.canonicalRepositoryRoot || observation.canonicalRoot !== replay.daisyBinding.canonicalRepositoryRoot) {
      return blocked("root_mismatch", ["Observed canonical root does not exact-match Daisy authority and binding."]);
    }
    if (observation.branch !== replay.daisyAuthority.branch || observation.branch !== replay.daisyBinding.branch) {
      return blocked("branch_mismatch", ["Observed branch does not exact-match Daisy authority and binding."]);
    }
    if (observation.headRevision !== replay.daisyAuthority.headRevision || observation.headRevision !== replay.daisyBinding.headRevision) {
      return blocked("head_mismatch", ["Observed HEAD does not exact-match Daisy authority and binding."]);
    }
  } else {
    if (observation.canonicalRoot !== replay.authority.canonicalWritableRoot || observation.canonicalRoot !== replay.binding.binding.canonicalWritableRoot) {
      return blocked("root_mismatch", ["Observed canonical root does not exact-match authority and binding."]);
    }
    if (observation.branch !== replay.authority.branch || observation.branch !== replay.binding.binding.branch) {
      return blocked("branch_mismatch", ["Observed branch does not exact-match authority and binding."]);
    }
    if (observation.headRevision !== replay.authority.headRevision || observation.headRevision !== replay.authority.artifactRevisionId || observation.headRevision !== replay.binding.headRevision || observation.headRevision !== replay.binding.binding.artifactRevisionId) {
      return blocked("head_mismatch", ["Observed HEAD does not exact-match authority, binding, and artifact revisions."]);
    }
  }
  return null;
}

async function readReplay(snapshot: InputSnapshot, ordinal: "First" | "Second"): Promise<{ state: "ready"; value: ReplaySnapshot } | Exclude<Schema9SeatDispatchProjectionResultV1, { state: "ready" }>> {
  let read;
  try {
    read = await readMissionJournalForDisplay({
      repositoryRoot: snapshot.repositoryRoot,
      configuredJournalPath: snapshot.configuredJournalPath,
      missionId: snapshot.missionId,
    });
  } catch {
    return blocked("journal_invalid", [`${ordinal} mission journal read failed.`]);
  }
  if (read.state === "invalid") {
    if (read.code === "unsupported_schema" || read.code === "schema_mixed") return blocked("schema_unsupported", [read.code, ...read.errors]);
    return blocked("journal_invalid", [read.code, ...read.errors]);
  }
  if (read.value.kind !== "profile-aware") return blocked("schema_unsupported", ["Seat-dispatch projection requires schema-9 profile-aware replay."]);
  return validateReplay(snapshot, read.value);
}

export async function loadSchema9SeatDispatchProjectionV1(input: Schema9SeatDispatchProjectionInputV1): Promise<Schema9SeatDispatchProjectionResultV1> {
  let checkedInput;
  try {
    checkedInput = snapshotInput(input);
  } catch {
    return blocked("input_invalid", ["Schema-9 seat-dispatch projection input inspection failed."]);
  }
  if (checkedInput.state === "blocked") return checkedInput;
  const snapshot = checkedInput.value;

  const firstReplay = await readReplay(snapshot, "First");
  if (firstReplay.state === "blocked") return firstReplay;
  let firstObservation: RepositoryObservationInternal;
  try {
    firstObservation = await observeRepository(snapshot.ops, snapshot.repositoryRoot);
  } catch (error) {
    return blocked("observation_failed", [`First repository observation failed: ${String((error as Error).message ?? "unknown_error")}.`]);
  }
  const firstObservationError = checkObservation(firstObservation, firstReplay.value);
  if (firstObservationError !== null) return firstObservationError;

  let secondObservation: RepositoryObservationInternal;
  try {
    secondObservation = await observeRepository(snapshot.ops, snapshot.repositoryRoot);
  } catch (error) {
    return blocked("observation_failed", [`Second repository observation failed: ${String((error as Error).message ?? "unknown_error")}.`]);
  }
  const secondReplay = await readReplay(snapshot, "Second");
  if (secondReplay.state === "blocked") return secondReplay;
  const secondObservationError = checkObservation(secondObservation, secondReplay.value);
  if (secondObservationError !== null) return secondObservationError;

  if (firstReplay.value.journalDigest !== secondReplay.value.journalDigest || canonicalJson(firstReplay.value.projection) !== canonicalJson(secondReplay.value.projection)) {
    return blocked("journal_drift", ["Canonical journal content or replay projection drifted between observations."]);
  }
  if (("daisyAuthority" in firstReplay.value) !== ("daisyAuthority" in secondReplay.value)) {
    return blocked("journal_drift", ["Seat authority path drifted between observations."]);
  }
  if ("daisyAuthority" in firstReplay.value && "daisyAuthority" in secondReplay.value) {
    if (firstReplay.value.daisyAuthorityDigest !== secondReplay.value.daisyAuthorityDigest ||
        firstReplay.value.daisyBindingDigest !== secondReplay.value.daisyBindingDigest) {
      return blocked("journal_drift", ["Active Daisy authority or binding drifted between observations."]);
    }
  } else if (!("daisyAuthority" in firstReplay.value) && !("daisyAuthority" in secondReplay.value) &&
      (firstReplay.value.authorityDigest !== secondReplay.value.authorityDigest || firstReplay.value.bindingDigest !== secondReplay.value.bindingDigest)) {
    return blocked("journal_drift", ["Active authority or May binding drifted between observations."]);
  }
  if (firstObservation.canonicalRoot !== secondObservation.canonicalRoot) return blocked("root_mismatch", ["Canonical repository root drifted between observations."]);
  if (firstObservation.branch !== secondObservation.branch) return blocked("branch_mismatch", ["Repository branch drifted between observations."]);
  if (firstObservation.headRevision !== secondObservation.headRevision) return blocked("head_mismatch", ["Repository HEAD drifted between observations."]);

  const replay = firstReplay.value;
  const observation = (value: RepositoryObservationInternal): Schema9SeatDispatchRepositoryObservationV1 => ({
    canonicalRoot: value.canonicalRoot,
    branch: value.branch,
    headRevision: value.headRevision,
  });
  const common = {
    contractVersion: SCHEMA9_SEAT_DISPATCH_PROJECTION_CONTRACT_VERSION,
    purpose: snapshot.purpose,
    journalSchemaVersion: 9 as const,
    journalDigest: replay.journalDigest,
    missionId: replay.projection.missionId,
    subjectId: replay.projection.brief.subjectId,
    missionRevisionId: replay.projection.brief.revisionId,
    artifactRevisionId: "daisyAuthority" in replay ? replay.daisyAuthority.headRevision : replay.authority.artifactRevisionId,
    evaluatedThroughSequence: replay.projection.lastSequence,
    missionAuthorization: { state: "authorized" as const, evidence: jsonCopy(replay.missionAuthorization) },
    profile: {
      profileId: replay.projection.brief.profileId,
      profileVersion: replay.projection.brief.profileVersion,
      requirementsDigest: replay.requirementsDigest,
      executionReadiness: "ready" as const,
      satisfiedExecutionGates: replay.satisfiedExecutionGates.map((gate) => ({ ...gate })),
    },
    lifecycle: { execution: replay.projection.execution as "not-started" | "running", finalAcceptance: "waiting" as const },
  };
  if ("daisyAuthority" in replay) {
    const content = {
      ...common,
      daisyCoordinationAuthority: {
        digest: replay.daisyAuthorityDigest,
        sequence: replay.daisyAuthoritySequence,
        authority: jsonCopy(replay.daisyAuthority),
      },
      daisyRuntimeBinding: { digest: replay.daisyBindingDigest, binding: jsonCopy(replay.daisyBinding) },
      repositoryObservations: [observation(firstObservation), observation(secondObservation)] as [Schema9SeatDispatchRepositoryObservationV1, Schema9SeatDispatchRepositoryObservationV1],
      authorityPath: "daisy_feature_flight_coordination" as const,
      materialGateDisposition: "not_applicable_explicit_authority" as const,
    };
    const projection: Schema9DaisySeatDispatchProjectionV1 = { ...content, projectionDigest: digest(content) };
    return { state: "ready", projection: deepFreeze(projection) };
  }
  const content = {
    ...common,
    implementationAuthority: { digest: replay.authorityDigest, authority: jsonCopy(replay.authority) },
    mayRuntimeBinding: { digest: replay.bindingDigest, binding: jsonCopy(replay.binding) },
    repositoryObservations: [observation(firstObservation), observation(secondObservation)] as [Schema9SeatDispatchRepositoryObservationV1, Schema9SeatDispatchRepositoryObservationV1],
    authorityPath: "explicit_wheels_up" as const,
    materialGateDisposition: "not_applicable_explicit_authority" as const,
  };
  const projection: Schema9MaySeatDispatchProjectionV1 = {
    ...content,
    projectionDigest: digest(content),
  };
  return { state: "ready", projection: deepFreeze(projection) };
}
