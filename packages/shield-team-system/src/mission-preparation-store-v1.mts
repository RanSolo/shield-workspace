import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalJson } from "./mission-v2.mjs";
import {
  validateParentPlanReviewEvidenceV1,
  validateTransitionIntentV1,
  validateTransitionPlanV1,
  type ParentPlanReviewEvidenceV1,
  type TransitionIntentV1,
  type TransitionPlanV1,
} from "@shield/mission-preparation";

export const MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_VERSION = 1 as const;
export const MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID = "mission.reviewed-transition-graph.v1" as const;
export const MISSION_REVIEWED_TRANSITION_GRAPH_ID_PREFIX = "reviewed-transition-graph:" as const;

const INPUT_FIELDS = ["transitionPlan", "parentPlanReviewEvidence", "transitionIntent"] as const;
const GRAPH_FIELDS = [
  "schemaVersion", "schemaId", "authority", "graphId", "graphDigest", "transitionPlan", "parentPlanReviewEvidence", "transitionIntent",
] as const;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const GRAPH_ID = /^reviewed-transition-graph:[A-Za-z0-9_-]{43}$/u;

export interface MissionReviewedTransitionGraphV1 {
  readonly schemaVersion: 1;
  readonly schemaId: typeof MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID;
  readonly authority: "none";
  readonly graphId: string;
  readonly graphDigest: string;
  readonly transitionPlan: TransitionPlanV1;
  readonly parentPlanReviewEvidence: ParentPlanReviewEvidenceV1;
  readonly transitionIntent: TransitionIntentV1;
}

export type MissionReviewedTransitionGraphBuildResultV1 = Readonly<
  | { state: "built"; graph: MissionReviewedTransitionGraphV1 }
  | { state: "invalid"; code: "malformed_reviewed_transition_graph_input" | "invalid_reviewed_transition_graph"; errors: readonly string[] }
>;

export type MissionReviewedTransitionGraphValidationResultV1 = Readonly<
  | { state: "valid"; value: MissionReviewedTransitionGraphV1 }
  | { state: "invalid"; code: "invalid_reviewed_transition_graph"; errors: readonly string[] }
>;

type Plain = Record<string, unknown>;

function plain(value: unknown): value is Plain {
  try {
    return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
  } catch {
    return false;
  }
}

function exact(value: unknown, fields: readonly string[]): value is Plain {
  if (!plain(value)) return false;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) return false;
  for (const key of keys) {
    if (typeof key !== "string") return false;
    if (!fields.includes(key)) return false;
  }
  return fields.every((field) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    return descriptor?.enumerable === true && Object.hasOwn(descriptor, "value") && descriptor.value !== undefined;
  });
}

function cloneClosedData(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value;
  if (typeof value !== "object" || isProxy(value) || seen.has(value)) throw new TypeError("non_closed_data");

  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError("non_plain_array");
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string") || keys.length !== value.length + 1) throw new TypeError("array_sparsity");
    seen.add(value);
    const output: unknown[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const key = String(index);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("array_accessor");
      output.push(cloneClosedData(descriptor.value, seen));
    }
    seen.delete(value);
    return output;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("non_plain_data");
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) throw new TypeError("symbol_keys");
  seen.add(value);
  const output: Plain = {};
  for (const key of keys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError("object_accessor");
    output[key] = cloneClosedData(descriptor.value, seen);
  }
  seen.delete(value);
  return output;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    const keys = Array.isArray(value) ? value : Object.keys(value);
    for (const key of keys) {
      // @ts-expect-error indexing into unknown closed data for mutation isolation.
      deepFreeze(value[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function invalidBuild(
  code: "malformed_reviewed_transition_graph_input" | "invalid_reviewed_transition_graph",
  ...errors: readonly string[]
): MissionReviewedTransitionGraphBuildResultV1 {
  return Object.freeze({
    state: "invalid",
    code,
    errors: Object.freeze(errors.length === 0 ? ["Reviewed transition graph is invalid."] : errors),
  });
}

function invalidValidation(
  code: "invalid_reviewed_transition_graph",
  ...errors: readonly string[]
): MissionReviewedTransitionGraphValidationResultV1 {
  return Object.freeze({
    state: "invalid",
    code,
    errors: Object.freeze(errors.length === 0 ? ["Reviewed transition graph is invalid."] : errors),
  });
}

export function computeMissionReviewedTransitionGraphDigestV1(input: {
  schemaVersion: 1;
  schemaId: typeof MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID;
  authority: "none";
  transitionPlan: TransitionPlanV1;
  parentPlanReviewEvidence: ParentPlanReviewEvidenceV1;
  transitionIntent: TransitionIntentV1;
}): string {
  const cloned = cloneClosedData(input);
  if (!plain(cloned) ||
    Object.getPrototypeOf(input) !== Object.getPrototypeOf(cloned) ||
    (cloned as Plain).schemaVersion !== 1 ||
    (cloned as Plain).schemaId !== MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID ||
    (cloned as Plain).authority !== "none") {
    throw new Error("Invalid reviewed transition graph digest input.");
  }

  return `sha256:${createHash("sha256").update(`${MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID}\0${canonicalJson(cloned)}`).digest("base64url")}`;
}

export function computeMissionReviewedTransitionGraphIdV1(input: string): string {
  if (!DIGEST.test(input)) throw new Error("Invalid reviewed transition graph digest.");
  return `${MISSION_REVIEWED_TRANSITION_GRAPH_ID_PREFIX}${input.slice("sha256:".length)}`;
}

function identityBindingsMatch(
  transitionPlan: TransitionPlanV1,
  parentPlanReviewEvidence: ParentPlanReviewEvidenceV1,
  transitionIntent: TransitionIntentV1,
): readonly string[] {
  const errors: string[] = [];

  if (
    transitionPlan.missionId !== transitionIntent.missionId ||
    transitionPlan.subjectId !== transitionIntent.subjectId ||
    transitionPlan.repositoryId !== transitionIntent.repositoryId ||
    transitionPlan.planningBaseRevision !== transitionIntent.planningBaseRevision
  ) {
    errors.push("transition_plan_and_intent_identity_mismatch");
  }

  if (transitionIntent.transitionPlanId !== transitionPlan.id || transitionIntent.transitionPlanDigest !== transitionPlan.digest) {
    errors.push("intent_transition_plan_reference_mismatch");
  }

  if (parentPlanReviewEvidence.transitionPlanId !== transitionPlan.id || parentPlanReviewEvidence.transitionPlanDigest !== transitionPlan.digest) {
    errors.push("parent_review_transition_plan_reference_mismatch");
  }

  if (
    parentPlanReviewEvidence.repositoryId !== transitionPlan.repositoryId ||
    parentPlanReviewEvidence.planningBaseRevision !== transitionPlan.planningBaseRevision ||
    parentPlanReviewEvidence.parentPlanCommit !== transitionPlan.parentPlanCommit ||
    parentPlanReviewEvidence.parentPlanPath !== transitionPlan.parentPlanPath ||
    parentPlanReviewEvidence.parentPlanRawSha256 !== transitionPlan.parentPlanRawSha256
  ) {
    errors.push("parent_review_plan_identity_mismatch");
  }

  if (
    parentPlanReviewEvidence.verdict !== "PASS" ||
    transitionIntent.parentReviewEvidenceId !== parentPlanReviewEvidence.id ||
    transitionIntent.parentReviewEvidenceDigest !== parentPlanReviewEvidence.digest
  ) {
    errors.push("parent_review_projection_mismatch");
  }

  return errors;
}

export function buildMissionReviewedTransitionGraphV1(input: unknown): MissionReviewedTransitionGraphBuildResultV1 {
  let copied: unknown;
  try {
    copied = cloneClosedData(input);
  } catch {
    return invalidBuild("malformed_reviewed_transition_graph_input", "Reviewed transition graph input must be closed ordinary data.");
  }

  if (!exact(copied, INPUT_FIELDS)) {
    return invalidBuild("malformed_reviewed_transition_graph_input", "Reviewed transition graph input fields are not closed.");
  }

  const transitionPlanCheck = validateTransitionPlanV1({ artifact: copied.transitionPlan });
  if (transitionPlanCheck.state === "invalid") {
    return invalidBuild("invalid_reviewed_transition_graph", ...transitionPlanCheck.errors);
  }

  const reviewCheck = validateParentPlanReviewEvidenceV1({ artifact: copied.parentPlanReviewEvidence });
  if (reviewCheck.state === "invalid") {
    return invalidBuild("invalid_reviewed_transition_graph", ...reviewCheck.errors);
  }

  const intentCheck = validateTransitionIntentV1({ artifact: copied.transitionIntent });
  if (intentCheck.state === "invalid") {
    return invalidBuild("invalid_reviewed_transition_graph", ...intentCheck.errors);
  }

  const bindingErrors = identityBindingsMatch(transitionPlanCheck.value, reviewCheck.value, intentCheck.value);
  if (bindingErrors.length !== 0) {
    return invalidBuild("invalid_reviewed_transition_graph", ...bindingErrors);
  }

  const body = {
    schemaVersion: MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_VERSION,
    schemaId: MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID,
    authority: "none" as const,
    transitionPlan: transitionPlanCheck.value,
    parentPlanReviewEvidence: reviewCheck.value,
    transitionIntent: intentCheck.value,
  };

  const graphDigest = computeMissionReviewedTransitionGraphDigestV1(body);
  const graphId = computeMissionReviewedTransitionGraphIdV1(graphDigest);

  return { state: "built", graph: deepFreeze({ ...body, graphId, graphDigest } as MissionReviewedTransitionGraphV1) };
}

export function validateMissionReviewedTransitionGraphV1(input: unknown): MissionReviewedTransitionGraphValidationResultV1 {
  let copied: unknown;
  try {
    copied = cloneClosedData(input);
  } catch {
    return invalidValidation("invalid_reviewed_transition_graph", "Mission reviewed transition graph must be closed ordinary data.");
  }

  if (!exact(copied, GRAPH_FIELDS)) {
    return invalidValidation("invalid_reviewed_transition_graph", "Mission reviewed transition graph fields are not closed.");
  }

  const candidate = copied as unknown as MissionReviewedTransitionGraphV1;
  if (candidate.schemaVersion !== 1 || candidate.schemaId !== MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID || candidate.authority !== "none") {
    return invalidValidation("invalid_reviewed_transition_graph", "Mission reviewed transition graph header fields are invalid.");
  }

  if (!DIGEST.test(candidate.graphDigest) || !GRAPH_ID.test(candidate.graphId)) {
    return invalidValidation("invalid_reviewed_transition_graph", "Mission reviewed transition graph identity fields are invalid.");
  }

  const transitionPlanCheck = validateTransitionPlanV1({ artifact: candidate.transitionPlan });
  if (transitionPlanCheck.state === "invalid") {
    return invalidValidation("invalid_reviewed_transition_graph", ...transitionPlanCheck.errors);
  }

  const reviewCheck = validateParentPlanReviewEvidenceV1({ artifact: candidate.parentPlanReviewEvidence });
  if (reviewCheck.state === "invalid") {
    return invalidValidation("invalid_reviewed_transition_graph", ...reviewCheck.errors);
  }

  const intentCheck = validateTransitionIntentV1({ artifact: candidate.transitionIntent });
  if (intentCheck.state === "invalid") {
    return invalidValidation("invalid_reviewed_transition_graph", ...intentCheck.errors);
  }

  const bindingErrors = identityBindingsMatch(transitionPlanCheck.value, reviewCheck.value, intentCheck.value);
  if (bindingErrors.length > 0) {
    return invalidValidation("invalid_reviewed_transition_graph", ...bindingErrors);
  }

  const recomputedGraphDigest = computeMissionReviewedTransitionGraphDigestV1({
    schemaVersion: MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_VERSION,
    schemaId: MISSION_REVIEWED_TRANSITION_GRAPH_SCHEMA_ID,
    authority: "none" as const,
    transitionPlan: transitionPlanCheck.value,
    parentPlanReviewEvidence: reviewCheck.value,
    transitionIntent: intentCheck.value,
  });
  if (recomputedGraphDigest !== candidate.graphDigest) {
    return invalidValidation("invalid_reviewed_transition_graph", "Mission reviewed transition graph digest is invalid.");
  }

  const recomputedGraphId = computeMissionReviewedTransitionGraphIdV1(recomputedGraphDigest);
  if (recomputedGraphId !== candidate.graphId) {
    return invalidValidation("invalid_reviewed_transition_graph", "Mission reviewed transition graph identity is invalid.");
  }

  return {
    state: "valid",
    value: deepFreeze({
      ...candidate,
      transitionPlan: transitionPlanCheck.value,
      parentPlanReviewEvidence: reviewCheck.value,
      transitionIntent: intentCheck.value,
    }),
  };
}
