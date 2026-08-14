import { isProxy } from "node:util/types";

import {
  BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1,
  type GuidedReviewBuiltInTemplateV1,
} from "./guided-review-playbooks-v1.mjs";
import {
  createGuidedReviewRouteRequestV1,
  materializeGuidedReviewRouteRequestV1,
  type GuidedReviewRoutePackagePathsV1,
  type GuidedReviewRouteRequestInputV1,
  type GuidedReviewRouteRequestResultV1,
  type GuidedReviewRouteRequestV1,
} from "./guided-review-route-request-v1.mjs";
import type {
  GuidedReviewCriterionV1,
  GuidedReviewParticipantRelationshipV1,
  GuidedReviewPlanV1,
  GuidedReviewRuntimeHandoffV1,
} from "./guided-review-v1.mjs";
import type { PreparedPublicationReadyResultV1 } from "./mission-preparation-host-v1.mjs";

export interface GuidedReviewRoutePreparationContextV1 {
  readonly plan: GuidedReviewPlanV1;
  readonly acceptanceCriteria: readonly GuidedReviewCriterionV1[];
  readonly runtimeHandoff: GuidedReviewRuntimeHandoffV1;
  readonly participantRelationship: GuidedReviewParticipantRelationshipV1;
  readonly kind: GuidedReviewBuiltInTemplateV1["kind"];
}

export interface PrepareGuidedReviewRouteHostInputV1 {
  readonly preparation: PreparedPublicationReadyResultV1;
  readonly repositoryRoot: string;
  readonly context: GuidedReviewRoutePreparationContextV1;
}

export interface GuidedReviewRoutePreparationHostDependenciesV1 {
  readonly createRequest: (input: unknown) => GuidedReviewRouteRequestResultV1<GuidedReviewRouteRequestV1>;
  readonly materializeRequest: (repositoryRoot: string, request: unknown) => Promise<GuidedReviewRouteRequestResultV1<GuidedReviewRoutePackagePathsV1>>;
}

export type GuidedReviewRoutePreparationRequiredV1 = Readonly<{
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

export type PrepareGuidedReviewRouteHostResultV1 = GuidedReviewRoutePreparationRequiredV1 |
  Readonly<{ state: "invalid"; code: string; errors: readonly string[] }>;

const CONTEXT_FIELDS = ["plan", "acceptanceCriteria", "runtimeHandoff", "participantRelationship", "kind"] as const;
const INPUT_FIELDS = ["preparation", "repositoryRoot", "context"] as const;
const DEFAULT_DEPENDENCIES: GuidedReviewRoutePreparationHostDependenciesV1 = Object.freeze({
  createRequest: createGuidedReviewRouteRequestV1,
  materializeRequest: materializeGuidedReviewRouteRequestV1,
});

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Reflect.ownKeys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
function invalid(code: string, error: string): PrepareGuidedReviewRouteHostResultV1 {
  return { state: "invalid", code, errors: Object.freeze([error]) };
}

function protectedPolicy(preparation: PreparedPublicationReadyResultV1): GuidedReviewRouteRequestInputV1["policyMode"] | null {
  const capabilities = preparation.protectedGraph.transitionPlan.approvedCapabilities;
  const required = capabilities.includes("guided_review_required");
  const omitted = capabilities.includes("guided_review_omitted");
  return required && omitted ? null : required ? "required" : omitted ? "omitted" : "operator_optional";
}

export async function prepareGuidedReviewRouteRequestHostV1(
  input: unknown,
  dependencies: GuidedReviewRoutePreparationHostDependenciesV1 = DEFAULT_DEPENDENCIES,
): Promise<PrepareGuidedReviewRouteHostResultV1> {
  if (!exact(input, INPUT_FIELDS) || !exact(input.context, CONTEXT_FIELDS) || typeof input.repositoryRoot !== "string" || input.repositoryRoot.length === 0 ||
      !plain(input.preparation) || input.preparation.schemaVersion !== 1 || input.preparation.state !== "publication_ready") {
    return invalid("INVALID_ROUTE_PREPARATION_INPUT", "Guided Review route preparation input or caller-owned context is malformed or open.");
  }
  const preparation = input.preparation as unknown as PreparedPublicationReadyResultV1;
  const context = input.context as unknown as GuidedReviewRoutePreparationContextV1;
  if (input.repositoryRoot !== preparation.observation.canonicalRoot) {
    return invalid("REPOSITORY_ROOT_MISMATCH", "Route preparation must materialize beneath the current prepared publication repository root.");
  }
  const policyMode = protectedPolicy(preparation);
  if (policyMode === null) return invalid("GUIDED_REVIEW_POLICY_CONFLICT", "Protected transition plan contains conflicting Guided Review policy capabilities.");
  if (policyMode === "omitted") return invalid("GUIDED_REVIEW_OMITTED", "Protected transition plan explicitly omits Guided Review; route preparation is ineligible.");
  const template = BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1.find((entry) => entry.kind === context.kind);
  if (template === undefined) return invalid("TEMPLATE_UNAVAILABLE", "No registered Guided Review template exists for the requested kind.");
  const graph = preparation.protectedGraph;
  const request = dependencies.createRequest({
    schemaVersion: 1,
    contractVersion: "guided.review.route-request.v1",
    authority: "none",
    missionId: preparation.missionId,
    missionRevisionId: preparation.observation.missionRevisionId,
    subjectId: graph.transitionPlan.subjectId,
    repositoryId: preparation.observation.repositoryId,
    branch: preparation.observation.branch,
    exactRevision: preparation.observation.headRevision,
    protectedGraphId: graph.graphId,
    protectedGraphDigest: graph.graphDigest,
    transitionPlanId: graph.transitionPlan.id,
    transitionPlanDigest: graph.transitionPlan.digest,
    parentPlanReviewEvidenceId: graph.parentPlanReviewEvidence.id,
    parentPlanReviewEvidenceDigest: graph.parentPlanReviewEvidence.digest,
    policyMode,
    templateId: template.templateId,
    templateVersion: template.templateVersion,
    templateDigest: template.templateDigest,
    templateRouteGraphDigest: template.routeGraphDigest,
    kind: context.kind,
    plan: context.plan,
    acceptanceCriteria: context.acceptanceCriteria,
    runtimeHandoff: context.runtimeHandoff,
    participantRelationship: context.participantRelationship,
  });
  if (request.state !== "ready") return invalid(request.code, request.errors.join(" "));
  const materialized = await dependencies.materializeRequest(input.repositoryRoot, request.value);
  if (materialized.state !== "ready") return invalid(materialized.code, materialized.errors.join(" "));
  return Object.freeze({
    schemaVersion: 1,
    state: "route_preparation_required",
    missionId: preparation.missionId,
    exactRevision: preparation.observation.headRevision,
    requestId: request.value.requestId,
    requestDigest: request.value.requestDigest,
    requestPath: materialized.value.routeRequestPath,
    accountableSeatId: "fury",
    request: request.value,
    paths: materialized.value,
  });
}
