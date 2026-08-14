import { lstat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { isProxy } from "node:util/types";

import {
  compileGuidedReviewRouteV1,
  createFormalGuidedReviewPlaybookV1,
  validateGuidedReviewRouteOverlayV1,
  type GuidedReviewCompiledRouteV1,
  type GuidedReviewRouteOverlayV1,
  type GuidedReviewRouteResultV1,
} from "./guided-review-route-overlay-v1.mjs";
import {
  discoverGuidedReviewRouteRequestsV1,
  readGuidedReviewRoutePackageJsonV1,
  type DiscoveredGuidedReviewRouteRequestV1,
  type GuidedReviewRoutePackagePathsV1,
  type GuidedReviewRouteRequestResultV1,
  type GuidedReviewRouteRequestV1,
} from "./guided-review-route-request-v1.mjs";
import type { GuidedReviewPlaybookV1, GuidedReviewResultV1 } from "./guided-review-v1.mjs";
import type { BuiltInGuidedReviewInputV1 } from "./guided-review-playbooks-v1.mjs";
import type { PreparedPublicationReadyResultV1 } from "./mission-preparation-host-v1.mjs";
import { readSeatDispatchReceiptLedgerSnapshotV1 } from "./seat-dispatch-store.mjs";
import {
  evaluateSeatDispatchAttributionV1,
  replaySeatDispatchReceiptsV1,
  type SeatDispatchReceiptIdentityV1,
  type SeatDispatchReceiptEventV1,
  type SeatDispatchReceiptProjectionV1,
} from "./seat-dispatch-receipt-v1.mjs";

export interface ResolveGuidedReviewRoutePreparationHostInputV1 {
  readonly preparation: PreparedPublicationReadyResultV1;
  readonly repositoryRoot: string;
}

export type GuidedReviewRouteResolutionLedgerResultV1 = Readonly<
  | { state: "ready"; entries: readonly SeatDispatchReceiptEventV1[] }
  | { state: "invalid"; code: string; errors: readonly string[] }
>;

export interface GuidedReviewRouteResolutionHostDependenciesV1 {
  readonly discoverRequests: (repositoryRoot: string) => Promise<GuidedReviewRouteRequestResultV1<readonly DiscoveredGuidedReviewRouteRequestV1[]>>;
  readonly readRouteOverlay: (repositoryRoot: string, request: unknown) => Promise<GuidedReviewRouteRequestResultV1<unknown>>;
  readonly readDispatchLedger: (repositoryRoot: string, repositoryId: string) => Promise<GuidedReviewRouteResolutionLedgerResultV1>;
  readonly compileRoute: (overlay: unknown) => GuidedReviewRouteResultV1<GuidedReviewCompiledRouteV1>;
  readonly createFormalPlaybook: (compiledRoute: unknown, input: BuiltInGuidedReviewInputV1) => GuidedReviewResultV1<GuidedReviewPlaybookV1>;
}

export type GuidedReviewRouteResolutionPreparationRequiredV1 = Readonly<{
  schemaVersion: 1;
  state: "route_preparation_required";
  missionId: string;
  exactRevision: string;
  requestId: string;
  requestDigest: string;
  requestPath: string;
  accountableSeatId: "fury";
  request: GuidedReviewRouteRequestV1;
  paths: GuidedReviewRoutePackagePathsV1;
}>;

export type GuidedReviewReadyV1 = Readonly<{
  schemaVersion: 1;
  state: "guided_review_ready";
  missionId: string;
  exactRevision: string;
  accountableSeatId: "fury";
  furyReceiptId: string;
  participant: import("./guided-review-v1.mjs").GuidedReviewParticipantV1;
  request: GuidedReviewRouteRequestV1;
  overlay: GuidedReviewRouteOverlayV1;
  compiledRoute: GuidedReviewCompiledRouteV1;
  playbook: GuidedReviewPlaybookV1;
  paths: GuidedReviewRoutePackagePathsV1;
}>;

export type ResolveGuidedReviewRoutePreparationHostResultV1 =
  | GuidedReviewRouteResolutionPreparationRequiredV1
  | GuidedReviewReadyV1
  | Readonly<{ state: "invalid"; code: string; errors: readonly string[] }>;

const INPUT_FIELDS = ["preparation", "repositoryRoot"] as const;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Reflect.ownKeys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}

function invalid(code: string, error: string): ResolveGuidedReviewRoutePreparationHostResultV1 {
  return Object.freeze({ state: "invalid", code, errors: Object.freeze([error]) });
}

function policyMode(preparation: PreparedPublicationReadyResultV1): GuidedReviewRouteRequestV1["policyMode"] | null {
  const capabilities = preparation.protectedGraph.transitionPlan.approvedCapabilities;
  const required = capabilities.includes("guided_review_required");
  const omitted = capabilities.includes("guided_review_omitted");
  return required && omitted ? null : required ? "required" : omitted ? "omitted" : "operator_optional";
}

function currentRequest(
  discovered: DiscoveredGuidedReviewRouteRequestV1,
  preparation: PreparedPublicationReadyResultV1,
  policy: GuidedReviewRouteRequestV1["policyMode"],
): boolean {
  const request = discovered.request;
  const graph = preparation.protectedGraph;
  return request.missionId === preparation.missionId && request.missionRevisionId === preparation.observation.missionRevisionId &&
    request.subjectId === graph.transitionPlan.subjectId && request.repositoryId === preparation.observation.repositoryId &&
    request.branch === preparation.observation.branch && request.exactRevision === preparation.observation.headRevision &&
    request.protectedGraphId === graph.graphId && request.protectedGraphDigest === graph.graphDigest &&
    request.transitionPlanId === graph.transitionPlan.id && request.transitionPlanDigest === graph.transitionPlan.digest &&
    request.parentPlanReviewEvidenceId === graph.parentPlanReviewEvidence.id &&
    request.parentPlanReviewEvidenceDigest === graph.parentPlanReviewEvidence.digest && request.policyMode === policy;
}

function overlayBindsRequest(overlay: GuidedReviewRouteOverlayV1, request: GuidedReviewRouteRequestV1): boolean {
  return overlay.missionId === request.missionId && overlay.subjectId === request.subjectId && overlay.repositoryId === request.repositoryId &&
    overlay.branch === request.branch && overlay.exactRevision === request.exactRevision && overlay.protectedGraphId === request.protectedGraphId &&
    overlay.protectedGraphDigest === request.protectedGraphDigest && overlay.templateId === request.templateId &&
    overlay.templateVersion === request.templateVersion && overlay.templateDigest === request.templateDigest && overlay.kind === request.kind;
}

function preparationRequired(
  preparation: PreparedPublicationReadyResultV1,
  discovered: DiscoveredGuidedReviewRouteRequestV1,
): GuidedReviewRouteResolutionPreparationRequiredV1 {
  return Object.freeze({
    schemaVersion: 1,
    state: "route_preparation_required",
    missionId: preparation.missionId,
    exactRevision: preparation.observation.headRevision,
    requestId: discovered.request.requestId,
    requestDigest: discovered.request.requestDigest,
    requestPath: discovered.paths.routeRequestPath,
    accountableSeatId: "fury",
    request: discovered.request,
    paths: discovered.paths,
  });
}

function completedDispatchBinds(
  projection: SeatDispatchReceiptProjectionV1,
  request: GuidedReviewRouteRequestV1,
  overlay: GuidedReviewRouteOverlayV1,
): boolean {
  const requiredOutputRefs = [request.requestId, request.requestDigest, overlay.overlayId, overlay.overlayDigest,
    request.protectedGraphId, request.protectedGraphDigest];
  const runtime = projection.runtimeHostHistory.at(-1);
  const executor = projection.executorHostHistory.at(-1);
  return projection.state === "completed" && projection.accountableSeatId === "fury" && projection.parentMissionId === request.missionId &&
    projection.parentMissionRevision === request.missionRevisionId && projection.repositoryId === request.repositoryId &&
    projection.repositoryRevision === request.exactRevision && projection.subjectId === request.subjectId &&
    projection.subjectRevision === request.exactRevision && projection.artifactId === request.requestId &&
    projection.artifactRevision === request.requestDigest && overlay.furyBindingRef === projection.receiptId &&
    projection.outputEvidenceRefs !== null && requiredOutputRefs.every((reference) => projection.outputEvidenceRefs?.includes(reference)) &&
    runtime !== undefined && executor !== undefined && runtime.runtimeId === overlay.furyReasoningRuntimeId &&
    runtime.model === overlay.furyModelId && executor.executorId === overlay.furyToolExecutorId;
}

function dispatchIdentityFromStarted(event: SeatDispatchReceiptEventV1): SeatDispatchReceiptIdentityV1 | null {
  if (event.kind !== "dispatch.started") return null;
  return Object.freeze({
    receiptId: event.receiptId,
    dispatchId: event.dispatchId,
    parentMissionId: event.parentMissionId,
    parentMissionRevision: event.parentMissionRevision,
    parentSessionId: event.parentSessionId,
    childTaskId: event.childTaskId,
    childSessionId: event.childSessionId,
    accountableSeatId: event.accountableSeatId,
    repositoryId: event.repositoryId,
    repositoryWorkspaceId: event.repositoryWorkspaceId,
    repositoryRevision: event.repositoryRevision,
    subjectId: event.subjectId,
    subjectRevision: event.subjectRevision,
    artifactId: event.artifactId,
    artifactRevision: event.artifactRevision,
    configuredRuntime: event.configuredRuntime,
    requestedRuntime: event.requestedRuntime,
    toolExecution: event.toolExecution,
    runtimeSelfReport: event.runtimeSelfReport,
    runtimeHostObserved: event.runtimeHostObserved,
    executorSelfReport: event.executorSelfReport,
    executorHostObserved: event.executorHostObserved,
  });
}

async function readDispatchLedger(repositoryRoot: string, repositoryId: string): Promise<GuidedReviewRouteResolutionLedgerResultV1> {
  const path = join(resolve(repositoryRoot), ".shield", "dispatch-receipts.jsonl");
  try {
    const stats = await lstat(path);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error("Dispatch ledger is not a regular file.");
    const bytes = await readFile(path, "utf8");
    const firstLine = bytes.endsWith("\n") ? bytes.slice(0, -1).split("\n")[0] : "";
    const first = JSON.parse(firstLine) as unknown;
    if (!plain(first) || first.repositoryId !== repositoryId || typeof first.repositoryWorkspaceId !== "string" ||
        !IDENTIFIER.test(first.repositoryWorkspaceId)) throw new Error("Dispatch ledger repository scope is invalid.");
    const snapshot = await readSeatDispatchReceiptLedgerSnapshotV1({ repositoryRoot, repositoryId, repositoryWorkspaceId: first.repositoryWorkspaceId });
    return snapshot.state === "valid"
      ? Object.freeze({ state: "ready", entries: snapshot.value.entries })
      : Object.freeze({ state: "invalid", code: snapshot.code, errors: snapshot.errors });
  } catch (error) {
    return Object.freeze({ state: "invalid", code: "DISPATCH_LEDGER_UNAVAILABLE",
      errors: Object.freeze([error instanceof Error ? error.message : "Dispatch ledger is unavailable."]) });
  }
}

const DEFAULT_DEPENDENCIES: GuidedReviewRouteResolutionHostDependenciesV1 = Object.freeze({
  discoverRequests: discoverGuidedReviewRouteRequestsV1,
  readRouteOverlay: (repositoryRoot: string, request: unknown) => readGuidedReviewRoutePackageJsonV1(repositoryRoot, request, "routeOverlay"),
  readDispatchLedger,
  compileRoute: compileGuidedReviewRouteV1,
  createFormalPlaybook: createFormalGuidedReviewPlaybookV1,
});

export async function resolveGuidedReviewRoutePreparationHostV1(
  input: unknown,
  dependencies: GuidedReviewRouteResolutionHostDependenciesV1 = DEFAULT_DEPENDENCIES,
): Promise<ResolveGuidedReviewRoutePreparationHostResultV1> {
  if (!exact(input, INPUT_FIELDS) || typeof input.repositoryRoot !== "string" || input.repositoryRoot.length === 0 || !plain(input.preparation) ||
      input.preparation.schemaVersion !== 1 || input.preparation.state !== "publication_ready") {
    return invalid("INVALID_ROUTE_RESOLUTION_INPUT", "Guided Review route resolution input is malformed or open.");
  }
  const preparation = input.preparation as unknown as PreparedPublicationReadyResultV1;
  if (input.repositoryRoot !== preparation.observation.canonicalRoot) {
    return invalid("REPOSITORY_ROOT_MISMATCH", "Route resolution must use the current prepared publication repository root.");
  }
  const policy = policyMode(preparation);
  if (policy === null) return invalid("GUIDED_REVIEW_POLICY_CONFLICT", "Protected transition plan contains conflicting Guided Review policy capabilities.");
  if (policy === "omitted") return invalid("GUIDED_REVIEW_OMITTED", "Protected transition plan explicitly omits Guided Review.");

  const discovery = await dependencies.discoverRequests(input.repositoryRoot);
  if (discovery.state !== "ready") return invalid(discovery.code, discovery.errors.join(" "));
  const matches = discovery.value.filter((candidate) => currentRequest(candidate, preparation, policy));
  if (matches.length !== 1) {
    return invalid(matches.length === 0 ? "CURRENT_ROUTE_REQUEST_NOT_FOUND" : "AMBIGUOUS_CURRENT_ROUTE_REQUEST",
      `Expected exactly one request package for the current protected mission snapshot; found ${matches.length}.`);
  }
  const discovered = matches[0];
  if (discovered === undefined) return invalid("CURRENT_ROUTE_REQUEST_NOT_FOUND", "Current route request package is unavailable.");

  const overlayRead = await dependencies.readRouteOverlay(input.repositoryRoot, discovered.request);
  if (overlayRead.state !== "ready") {
    return overlayRead.code === "PACKAGE_ARTIFACT_MISSING" ? preparationRequired(preparation, discovered) : invalid(overlayRead.code, overlayRead.errors.join(" "));
  }
  const overlayResult = validateGuidedReviewRouteOverlayV1(overlayRead.value);
  if (overlayResult.state !== "ready") return invalid(overlayResult.code, overlayResult.errors.join(" "));
  const overlay = overlayResult.value;
  if (!overlayBindsRequest(overlay, discovered.request)) {
    return invalid("ROUTE_OVERLAY_REQUEST_BINDING_MISMATCH", "Route overlay mission, graph, revision, or template bindings do not match the current request.");
  }

  const ledger = await dependencies.readDispatchLedger(input.repositoryRoot, discovered.request.repositoryId);
  if (ledger.state !== "ready") return invalid(ledger.code, ledger.errors.join(" "));
  const replay = replaySeatDispatchReceiptsV1(ledger.entries);
  if (replay.state !== "valid") return invalid("INVALID_DISPATCH_LEDGER_REPLAY", replay.reasonCodes.join(" "));
  const candidates = replay.projections.filter((projection) => projection.artifactId === discovered.request.requestId &&
    projection.artifactRevision === discovered.request.requestDigest);
  if (candidates.length === 0 || (candidates.length === 1 && candidates[0]?.state !== "completed")) return preparationRequired(preparation, discovered);
  if (candidates.length !== 1) return invalid("AMBIGUOUS_FURY_ROUTE_DISPATCH", "Expected exactly one Fury dispatch for the current request identity.");
  const candidate = candidates[0];
  if (candidate === undefined || candidate.receiptId !== overlay.furyBindingRef) {
    return invalid("INVALID_FURY_ROUTE_ATTRIBUTION", "The overlay does not name the sole completed dispatch receipt for the current request.");
  }
  const starts = replay.entries.filter((event) => event.kind === "dispatch.started" && event.receiptId === overlay.furyBindingRef);
  const identity = starts.length === 1 && starts[0] !== undefined ? dispatchIdentityFromStarted(starts[0]) : null;
  if (identity === null) return invalid("INVALID_FURY_ROUTE_ATTRIBUTION", "The named Fury receipt has no unique started-event identity.");
  const attribution = evaluateSeatDispatchAttributionV1({ ...identity, artifact: discovered.request, replayResult: replay });
  if (attribution.state === "unattributed") {
    return invalid("INVALID_FURY_ROUTE_ATTRIBUTION", `Named Fury receipt attribution failed: ${attribution.reasonCodes.join(" ")}.`);
  }
  const dispatch = attribution.receipt;
  if (dispatch.receiptId !== overlay.furyBindingRef || !completedDispatchBinds(dispatch, discovered.request, overlay)) {
    return invalid("INVALID_FURY_ROUTE_DISPATCH", "Completed Fury dispatch identity, outputs, or host-observed runtime bindings do not match the request and overlay.");
  }

  const compiled = dependencies.compileRoute(overlay);
  if (compiled.state !== "ready") return invalid(compiled.code, compiled.errors.join(" "));
  const playbook = dependencies.createFormalPlaybook(compiled.value, {
    missionId: discovered.request.missionId,
    subjectId: discovered.request.subjectId,
    repositoryId: discovered.request.repositoryId,
    branch: discovered.request.branch,
    exactRevision: discovered.request.exactRevision,
    plan: discovered.request.plan,
    title: `Guided Review — ${discovered.request.subjectId}`,
    participantRelationship: discovered.request.participantRelationship,
    acceptanceCriteria: discovered.request.acceptanceCriteria,
    runtimeHandoff: discovered.request.runtimeHandoff,
    relevantPaths: Object.freeze([]),
    evidenceRefs: Object.freeze([]),
  });
  if (playbook.state !== "ready") return invalid(playbook.code, playbook.errors.join(" "));
  return Object.freeze({ schemaVersion: 1, state: "guided_review_ready", missionId: preparation.missionId,
    exactRevision: preparation.observation.headRevision, accountableSeatId: "fury", furyReceiptId: dispatch.receiptId,
    participant: Object.freeze({ participantId: preparation.observation.signerHumanPrincipalId,
      relationship: discovered.request.participantRelationship, seatId: "coulson", bindingRef: preparation.observation.signingKeyRef }),
    request: discovered.request, overlay, compiledRoute: compiled.value, playbook: playbook.value, paths: discovered.paths });
}
