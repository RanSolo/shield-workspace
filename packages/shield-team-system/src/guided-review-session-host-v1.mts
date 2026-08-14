import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { isProxy } from "node:util/types";

import { validateGuidedReviewCompiledRouteV1, type GuidedReviewRouteResultV1, type GuidedReviewCompiledRouteV1 } from "./guided-review-route-overlay-v1.mjs";
import {
  materializeGuidedReviewRoutePackageJsonV1,
  readGuidedReviewRoutePackageJsonV1,
  resolveGuidedReviewRoutePackagePathsV1,
} from "./guided-review-route-request-v1.mjs";
import type { GuidedReviewReadyV1 } from "./guided-review-route-resolution-host-v1.mjs";
import { resolvePreparedMissionTransitionV1 } from "./mission-preparation-host-v1.mjs";
import {
  startGuidedReviewSessionV1,
  decideGuidedReviewStepV1,
  validateGuidedReviewPlaybookV1,
  validateGuidedReviewSessionV1,
  type GuidedReviewParticipantV1,
  type GuidedReviewPlaybookV1,
  type GuidedReviewResultV1,
  type GuidedReviewSessionV1,
} from "./guided-review-v1.mjs";
import { canonicalJson } from "./mission-v2.mjs";

export interface GuidedReviewSessionHostInputV1 {
  readonly repositoryRoot: string;
  readonly resolution: GuidedReviewReadyV1;
  readonly startedAt: string;
}

export interface GuidedReviewSessionHostDependenciesV1 {
  readonly validateCompiledRoute: (input: unknown) => GuidedReviewRouteResultV1<GuidedReviewCompiledRouteV1>;
  readonly validatePlaybook: (input: unknown) => GuidedReviewResultV1<GuidedReviewPlaybookV1>;
  readonly startSession: (playbook: unknown, input: unknown) => GuidedReviewResultV1<GuidedReviewSessionV1>;
  readonly validateSession: (playbook: unknown, session: unknown) => GuidedReviewResultV1<GuidedReviewSessionV1>;
  readonly readArtifact: typeof readGuidedReviewRoutePackageJsonV1;
  readonly materializeArtifact: typeof materializeGuidedReviewRoutePackageJsonV1;
  readonly resolvePaths: typeof resolveGuidedReviewRoutePackagePathsV1;
  readonly resolveActiveParticipant: (repositoryRoot: string, missionId: string, relationship: GuidedReviewParticipantV1["relationship"]) =>
    Promise<GuidedReviewResultV1<GuidedReviewParticipantV1>>;
}

export type GuidedReviewSessionHostResultV1 = Readonly<
  | { state: "invalid"; code: string; errors: readonly string[] }
  | { schemaVersion: 1; state: "guided_review_in_progress"; missionId: string; exactRevision: string; sessionDigest: string;
      sessionState: "active" | "blocked"; routeContext: Readonly<{ rationale: string; risks: readonly string[] }>;
      currentStage: Readonly<{ stageId: string; checkpointId: string; title: string; purpose: string }> | null;
      currentStep: Readonly<{ stepId: string; title: string; question: string; instructions: readonly string[]; criterionRefs: readonly string[];
        evidenceRefs: readonly string[]; relevantPaths: readonly string[] }> | null; paths: GuidedReviewReadyV1["paths"] }
  | { schemaVersion: 1; state: "guided_review_completed"; missionId: string; exactRevision: string;
      playbook: GuidedReviewPlaybookV1; session: GuidedReviewSessionV1; paths: GuidedReviewReadyV1["paths"] }
>;

const INPUT_FIELDS = ["repositoryRoot", "resolution", "startedAt"] as const;
const READY_FIELDS = ["schemaVersion", "state", "missionId", "exactRevision", "accountableSeatId", "furyReceiptId", "participant", "request", "overlay", "compiledRoute", "playbook", "paths"] as const;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Reflect.ownKeys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
function invalid(code: string, error: string): GuidedReviewSessionHostResultV1 {
  return Object.freeze({ state: "invalid", code, errors: Object.freeze([error]) });
}
function sessionId(requestDigest: string): string {
  return `guided-review-session:${createHash("sha256").update(requestDigest).digest("base64url")}`;
}

const DEFAULT_DEPENDENCIES: GuidedReviewSessionHostDependenciesV1 = Object.freeze({
  validateCompiledRoute: validateGuidedReviewCompiledRouteV1,
  validatePlaybook: validateGuidedReviewPlaybookV1,
  startSession: startGuidedReviewSessionV1,
  validateSession: validateGuidedReviewSessionV1,
  readArtifact: readGuidedReviewRoutePackageJsonV1,
  materializeArtifact: materializeGuidedReviewRoutePackageJsonV1,
  resolvePaths: resolveGuidedReviewRoutePackagePathsV1,
  resolveActiveParticipant: async (
    repositoryRoot: string,
    missionId: string,
    relationship: GuidedReviewParticipantV1["relationship"],
  ): Promise<GuidedReviewResultV1<GuidedReviewParticipantV1>> => {
    const prepared = await resolvePreparedMissionTransitionV1({ repositoryRoot, missionId });
    if (prepared.state !== "publication_ready") {
      return { state: "invalid", code: "ACTIVE_COULSON_UNAVAILABLE", errors: Object.freeze(["Current prepared publication and active Coulson binding are unavailable."]) };
    }
    return { state: "ready", value: Object.freeze({ participantId: prepared.observation.signerHumanPrincipalId,
      relationship, seatId: "coulson", bindingRef: prepared.observation.signingKeyRef }) };
  },
});

function validResolutionBindings(resolution: GuidedReviewReadyV1, playbook: GuidedReviewPlaybookV1, compiled: GuidedReviewCompiledRouteV1): boolean {
  return resolution.missionId === resolution.request.missionId && resolution.exactRevision === resolution.request.exactRevision &&
    resolution.accountableSeatId === "fury" && resolution.overlay.overlayId === compiled.overlay.overlayId &&
    resolution.overlay.overlayDigest === compiled.overlay.overlayDigest && resolution.compiledRoute.compiledRouteDigest === compiled.compiledRouteDigest &&
    playbook.missionId === resolution.request.missionId && playbook.subjectId === resolution.request.subjectId &&
    playbook.repositoryId === resolution.request.repositoryId && playbook.branch === resolution.request.branch &&
    playbook.exactRevision === resolution.exactRevision && playbook.overlayId === resolution.overlay.overlayId &&
    playbook.overlayDigest === resolution.overlay.overlayDigest && playbook.compiledRouteDigest === compiled.compiledRouteDigest;
}

function resultForSession(resolution: GuidedReviewReadyV1, playbook: GuidedReviewPlaybookV1, session: GuidedReviewSessionV1): GuidedReviewSessionHostResultV1 {
  if (session.state === "completed") return Object.freeze({ schemaVersion: 1, state: "guided_review_completed", missionId: resolution.missionId,
    exactRevision: resolution.exactRevision, playbook, session, paths: resolution.paths });
  if (session.state === "cancelled") return invalid("GUIDED_REVIEW_SESSION_CANCELLED", "A cancelled Guided Review session cannot be resumed for publication.");
  const stage = session.currentStageId === null ? null : playbook.stages.find((candidate) => candidate.stageId === session.currentStageId) ?? null;
  const step = session.currentStepId === null ? null : playbook.stages.flatMap((candidate) => candidate.steps)
    .find((candidate) => candidate.stepId === session.currentStepId) ?? null;
  if ((session.currentStageId !== null && stage === null) || (session.currentStepId !== null && step === null)) {
    return invalid("GUIDED_REVIEW_SESSION_ROUTE_MISMATCH", "Current Guided Review session position is absent from the exact playbook route.");
  }
  return Object.freeze({ schemaVersion: 1, state: "guided_review_in_progress", missionId: resolution.missionId,
    exactRevision: resolution.exactRevision, sessionDigest: session.sessionDigest, sessionState: session.state,
    routeContext: Object.freeze({ rationale: resolution.overlay.rationale, risks: Object.freeze([...resolution.overlay.risks]) }),
    currentStage: stage === null ? null : Object.freeze({ stageId: stage.stageId, checkpointId: stage.checkpointId, title: stage.title, purpose: stage.purpose }),
    currentStep: step === null ? null : Object.freeze({ stepId: step.stepId, title: step.title, question: step.question,
      instructions: Object.freeze([...step.instructions]), criterionRefs: Object.freeze([...step.criterionRefs]),
      evidenceRefs: Object.freeze([...step.evidenceRefs]), relevantPaths: Object.freeze([...step.relevantPaths]) }), paths: resolution.paths });
}

export async function startOrResumeGuidedReviewSessionHostV1(
  input: unknown,
  dependencies: GuidedReviewSessionHostDependenciesV1 = DEFAULT_DEPENDENCIES,
): Promise<GuidedReviewSessionHostResultV1> {
  if (!exact(input, INPUT_FIELDS) || typeof input.repositoryRoot !== "string" || input.repositoryRoot.length === 0 ||
      !exact(input.resolution, READY_FIELDS) || input.resolution.schemaVersion !== 1 ||
      input.resolution.state !== "guided_review_ready" ||
      typeof input.startedAt !== "string" || !TIMESTAMP.test(input.startedAt) || Number.isNaN(Date.parse(input.startedAt))) {
    return invalid("INVALID_GUIDED_REVIEW_SESSION_HOST_INPUT", "Session host input requires an exact ready route, active Coulson participant, and canonical start timestamp.");
  }
  const resolution = input.resolution as unknown as GuidedReviewReadyV1;
  const participant = resolution.participant;
  const activeParticipant = await dependencies.resolveActiveParticipant(input.repositoryRoot, resolution.missionId, resolution.request.participantRelationship);
  if (activeParticipant.state !== "ready" || canonicalJson(activeParticipant.value) !== canonicalJson(participant)) {
    return invalid("ACTIVE_COULSON_MISMATCH", "Guided Review participant does not match the current host-resolved Coulson identity.");
  }
  const compiled = dependencies.validateCompiledRoute(resolution.compiledRoute);
  if (compiled.state !== "ready") return invalid(compiled.code, compiled.errors.join(" "));
  const playbookResult = dependencies.validatePlaybook(resolution.playbook);
  if (playbookResult.state !== "ready") return invalid(playbookResult.code, playbookResult.errors.join(" "));
  const playbook = playbookResult.value;
  if (participant.relationship !== playbook.participantRelationship || participant.seatId !== "coulson" || participant.bindingRef === null ||
      !validResolutionBindings(resolution, playbook, compiled.value)) {
    return invalid("GUIDED_REVIEW_SESSION_BINDING_MISMATCH", "Participant, playbook, route, request, or exact HEAD binding is inconsistent.");
  }
  const resolvedPaths = await dependencies.resolvePaths(input.repositoryRoot, resolution.request);
  if (resolvedPaths.state !== "ready" || canonicalJson(resolvedPaths.value) !== canonicalJson(resolution.paths)) {
    return invalid("GUIDED_REVIEW_PACKAGE_PATH_INVALID", "Guided Review package paths do not match the exact repository root and request identity.");
  }
  const repositoryRoot = input.repositoryRoot;
  const storedPlaybook = await dependencies.readArtifact(repositoryRoot, resolution.request, "playbook");
  let stored = await dependencies.readArtifact(repositoryRoot, resolution.request, "session");
  const playbookMissing = storedPlaybook.state !== "ready" && storedPlaybook.code === "PACKAGE_ARTIFACT_MISSING";
  const sessionMissing = stored.state !== "ready" && stored.code === "PACKAGE_ARTIFACT_MISSING";
  if (playbookMissing !== sessionMissing) {
    return invalid("GUIDED_REVIEW_PACKAGE_ARTIFACT_MISSING", "Guided Review playbook/session initialization is incomplete or a previously frozen artifact was deleted; recreation is forbidden.");
  }
  if (!playbookMissing && storedPlaybook.state !== "ready") return invalid(storedPlaybook.code, storedPlaybook.errors.join(" "));
  if (storedPlaybook.state === "ready" && canonicalJson(storedPlaybook.value) !== canonicalJson(playbook)) {
    return invalid("GUIDED_REVIEW_PLAYBOOK_BYTES_CHANGED", "Persisted Guided Review playbook no longer matches the exact compiled route.");
  }
  if (playbookMissing && sessionMissing) {
    const persistedPlaybook = await dependencies.materializeArtifact(repositoryRoot, resolution.request, "playbook", playbook, "exclusive");
    if (persistedPlaybook.state !== "ready") return invalid(persistedPlaybook.code, persistedPlaybook.errors.join(" "));
    const started = dependencies.startSession(playbook, { sessionId: sessionId(resolution.request.requestDigest), profile: "publication", participant, startedAt: input.startedAt });
    if (started.state !== "ready") return invalid(started.code, started.errors.join(" "));
    const created = await dependencies.materializeArtifact(repositoryRoot, resolution.request, "session", started.value, "exclusive");
    if (created.state === "ready") stored = { state: "ready", value: started.value };
    else if (created.code === "PACKAGE_ARTIFACT_ALREADY_EXISTS") stored = await dependencies.readArtifact(repositoryRoot, resolution.request, "session");
    else return invalid(created.code, created.errors.join(" "));
  }
  if (stored.state !== "ready") return invalid(stored.code, stored.errors.join(" "));
  const sessionResult = dependencies.validateSession(playbook, stored.value);
  if (sessionResult.state !== "ready") return invalid(sessionResult.code, sessionResult.errors.join(" "));
  const session = sessionResult.value;
  if (canonicalJson(session.participant) !== canonicalJson(participant) || session.profile !== "publication" ||
      session.exactRevision !== resolution.exactRevision || session.playbookDigest !== playbook.playbookDigest ||
      session.overlayId !== resolution.overlay.overlayId || session.overlayDigest !== resolution.overlay.overlayDigest ||
      session.compiledRouteDigest !== resolution.compiledRoute.compiledRouteDigest) {
    return invalid("GUIDED_REVIEW_SESSION_BINDING_MISMATCH", "Stored session is not the exact participant, route, playbook, and HEAD session requested.");
  }
  return resultForSession(resolution, playbook, session);
}

export interface RevalidateCompletedGuidedReviewSessionHostInputV1 {
  readonly repositoryRoot: string;
  readonly resolution: GuidedReviewReadyV1;
}

export type GuidedReviewCompletedSessionRevalidationDependenciesV1 = Pick<GuidedReviewSessionHostDependenciesV1,
  "validateCompiledRoute" | "validatePlaybook" | "validateSession" | "readArtifact" | "resolvePaths" | "resolveActiveParticipant">;

const READ_ONLY_REVALIDATION_DEPENDENCIES: GuidedReviewCompletedSessionRevalidationDependenciesV1 = Object.freeze({
  validateCompiledRoute: DEFAULT_DEPENDENCIES.validateCompiledRoute,
  validatePlaybook: DEFAULT_DEPENDENCIES.validatePlaybook,
  validateSession: DEFAULT_DEPENDENCIES.validateSession,
  readArtifact: DEFAULT_DEPENDENCIES.readArtifact,
  resolvePaths: DEFAULT_DEPENDENCIES.resolvePaths,
  resolveActiveParticipant: DEFAULT_DEPENDENCIES.resolveActiveParticipant,
});

export async function revalidateCompletedGuidedReviewSessionHostV1(
  input: unknown,
  dependencies: GuidedReviewCompletedSessionRevalidationDependenciesV1 = READ_ONLY_REVALIDATION_DEPENDENCIES,
): Promise<GuidedReviewSessionHostResultV1> {
  if (!exact(input, ["repositoryRoot", "resolution"]) || typeof input.repositoryRoot !== "string" || input.repositoryRoot.length === 0 ||
      !exact(input.resolution, READY_FIELDS) || input.resolution.schemaVersion !== 1 || input.resolution.state !== "guided_review_ready") {
    return invalid("INVALID_GUIDED_REVIEW_REVALIDATION_INPUT", "Completed Guided Review revalidation requires an exact ready route and repository root.");
  }
  const resolution = input.resolution as unknown as GuidedReviewReadyV1;
  const activeParticipant = await dependencies.resolveActiveParticipant(input.repositoryRoot, resolution.missionId, resolution.request.participantRelationship);
  if (activeParticipant.state !== "ready" || canonicalJson(activeParticipant.value) !== canonicalJson(resolution.participant)) {
    return invalid("ACTIVE_COULSON_MISMATCH", "Guided Review participant no longer matches the host-resolved Coulson identity.");
  }
  const compiled = dependencies.validateCompiledRoute(resolution.compiledRoute);
  if (compiled.state !== "ready") return invalid(compiled.code, compiled.errors.join(" "));
  const expectedPlaybook = dependencies.validatePlaybook(resolution.playbook);
  if (expectedPlaybook.state !== "ready") return invalid(expectedPlaybook.code, expectedPlaybook.errors.join(" "));
  if (!validResolutionBindings(resolution, expectedPlaybook.value, compiled.value)) {
    return invalid("GUIDED_REVIEW_REVALIDATION_BINDING_MISMATCH", "Resolved Guided Review playbook and compiled route bindings changed.");
  }
  const paths = await dependencies.resolvePaths(input.repositoryRoot, resolution.request);
  if (paths.state !== "ready" || canonicalJson(paths.value) !== canonicalJson(resolution.paths)) {
    return invalid("GUIDED_REVIEW_PACKAGE_PATH_INVALID", "Guided Review package paths changed during completed-session revalidation.");
  }
  const storedPlaybook = await dependencies.readArtifact(input.repositoryRoot, resolution.request, "playbook");
  if (storedPlaybook.state !== "ready") return invalid(storedPlaybook.code, storedPlaybook.errors.join(" "));
  if (canonicalJson(storedPlaybook.value) !== canonicalJson(expectedPlaybook.value)) {
    return invalid("GUIDED_REVIEW_PLAYBOOK_BYTES_CHANGED", "Persisted Guided Review playbook is absent or no longer the original exact artifact.");
  }
  const playbook = dependencies.validatePlaybook(storedPlaybook.value);
  if (playbook.state !== "ready") return invalid(playbook.code, playbook.errors.join(" "));
  const storedSession = await dependencies.readArtifact(input.repositoryRoot, resolution.request, "session");
  if (storedSession.state !== "ready") return invalid(storedSession.code, storedSession.errors.join(" "));
  const session = dependencies.validateSession(playbook.value, storedSession.value);
  if (session.state !== "ready") return invalid(session.code, session.errors.join(" "));
  if (session.value.state !== "completed" || canonicalJson(session.value.participant) !== canonicalJson(resolution.participant) ||
      session.value.exactRevision !== resolution.exactRevision || session.value.playbookDigest !== playbook.value.playbookDigest ||
      session.value.overlayId !== resolution.overlay.overlayId || session.value.overlayDigest !== resolution.overlay.overlayDigest ||
      session.value.compiledRouteDigest !== resolution.compiledRoute.compiledRouteDigest) {
    return invalid("GUIDED_REVIEW_NO_LONGER_COMPLETE", "Persisted Guided Review session is absent, incomplete, or no longer the original exact route session.");
  }
  return resultForSession(resolution, playbook.value, session.value);
}

export interface AnswerCurrentGuidedReviewSessionHostInputV1 {
  readonly repositoryRoot: string;
  readonly resolution: GuidedReviewReadyV1;
  readonly expectedSessionDigest: string;
  readonly disposition: "pass" | "fail" | "conditional_pass" | "not_observed";
  readonly observation: string;
  readonly condition: string | null;
  readonly decidedAt: string;
}

async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | (constants.O_DIRECTORY ?? 0));
  try { await handle.sync(); } finally { await handle.close(); }
}

export async function answerCurrentGuidedReviewSessionHostV1(
  input: AnswerCurrentGuidedReviewSessionHostInputV1,
): Promise<GuidedReviewResultV1<GuidedReviewSessionV1>> {
  const paths = await resolveGuidedReviewRoutePackagePathsV1(input.repositoryRoot, input.resolution.request);
  if (paths.state !== "ready" || canonicalJson(paths.value) !== canonicalJson(input.resolution.paths)) {
    return { state: "invalid", code: "GUIDED_REVIEW_PACKAGE_PATH_INVALID", errors: Object.freeze(["Guided Review answer paths are not deterministic for the exact request."]) };
  }
  const playbook = validateGuidedReviewPlaybookV1(input.resolution.playbook);
  if (playbook.state !== "ready") return playbook;
  const stored = await readGuidedReviewRoutePackageJsonV1(input.repositoryRoot, input.resolution.request, "session");
  if (stored.state !== "ready") return { state: "invalid", code: stored.code, errors: stored.errors };
  const current = validateGuidedReviewSessionV1(playbook.value, stored.value);
  if (current.state !== "ready") return current;
  if (current.value.sessionDigest !== input.expectedSessionDigest || canonicalJson(current.value.participant) !== canonicalJson(input.resolution.participant) ||
      current.value.exactRevision !== input.resolution.exactRevision || current.value.currentStepId === null) {
    return { state: "invalid", code: "GUIDED_REVIEW_ANSWER_STALE", errors: Object.freeze(["Guided Review answer does not bind the current exact question, participant, and HEAD."]) };
  }
  const decision = decideGuidedReviewStepV1(playbook.value, current.value, {
    decisionId: `decision:${createHash("sha256").update(current.value.sessionDigest).digest("base64url")}`,
    stepId: current.value.currentStepId,
    exactRevision: current.value.exactRevision,
    disposition: input.disposition,
    observation: input.observation,
    evidenceRefs: current.value.currentStepId === null ? [] : playbook.value.stages.flatMap((stage) => stage.steps)
      .find((step) => step.stepId === current.value.currentStepId)?.evidenceRefs ?? [],
    finding: input.disposition === "fail" || input.disposition === "not_observed" ? input.observation : null,
    condition: input.condition,
    decidedAt: input.decidedAt,
  });
  if (decision.state !== "ready") return decision;

  const path = paths.value.sessionPath;
  const lockPath = `${path}.lock`;
  const temporary = `${path}.tmp-${process.pid}`;
  let lock;
  try {
    lock = await open(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  } catch (error) {
    return { state: "invalid", code: "GUIDED_REVIEW_SESSION_BUSY", errors: Object.freeze([(error as NodeJS.ErrnoException).code === "EEXIST"
      ? "Guided Review session is already being updated." : "Guided Review session lock could not be created."]) };
  }
  try {
    await lock.sync();
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes: string;
    try { bytes = await handle.readFile("utf8"); } finally { await handle.close(); }
    if (bytes !== canonicalJson(current.value)) {
      return { state: "invalid", code: "GUIDED_REVIEW_ANSWER_STALE", errors: Object.freeze(["Guided Review session changed concurrently; reload the current question."]) };
    }
    const output = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await output.writeFile(canonicalJson(decision.value), "utf8"); await output.sync(); } finally { await output.close(); }
    await rename(temporary, path);
    await syncDirectory(dirname(path));
    return decision;
  } catch {
    return { state: "invalid", code: "GUIDED_REVIEW_ANSWER_WRITE_FAILED", errors: Object.freeze(["Guided Review answer could not be persisted atomically."]) };
  } finally {
    await lock.close();
    await unlink(temporary).catch(() => undefined);
    await unlink(lockPath).catch(() => undefined);
    await syncDirectory(dirname(path)).catch(() => undefined);
  }
}
