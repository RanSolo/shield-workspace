import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import {
  BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1,
  type BuiltInGuidedReviewInputV1,
  type GuidedReviewBuiltInTemplateV1,
} from "./guided-review-playbooks-v1.mjs";
import {
  GUIDED_REVIEW_CONTRACT_VERSION,
  createGuidedReviewPlaybookV1,
  type GuidedReviewPlaybookV1,
  type GuidedReviewResultV1,
} from "./guided-review-v1.mjs";
import { canonicalJson } from "./mission-v2.mjs";

export const GUIDED_REVIEW_ROUTE_OVERLAY_CONTRACT_VERSION = "guided.review.route-overlay.v1" as const;

export interface GuidedReviewRouteAcMappingV1 {
  readonly criterionId: string;
  readonly stepIds: readonly string[];
}

export interface GuidedReviewRouteInspectionPointV1 {
  readonly inspectionPointId: string;
  readonly targetStepId: string;
  readonly title: string;
  readonly instructions: readonly string[];
  readonly relevantPaths: readonly string[];
  readonly evidenceRefs: readonly string[];
}

export type GuidedReviewRouteOverrideV1 =
  | Readonly<{ operation: "remove"; targetStepId: string; rationale: string }>
  | Readonly<{ operation: "tighten"; targetStepId: string; additionalInstructions: readonly string[];
      additionalRelevantPaths: readonly string[]; additionalEvidenceRefs: readonly string[]; rationale: string }>
  | Readonly<{ operation: "add_after"; afterStepId: string; stageId: string; stepId: string; title: string; question: string;
      instructions: readonly string[]; dependsOnStepIds: readonly string[]; rationale: string }>;

export interface GuidedReviewRouteOverlayInputV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: typeof GUIDED_REVIEW_ROUTE_OVERLAY_CONTRACT_VERSION;
  readonly overlayId: string;
  readonly missionId: string;
  readonly subjectId: string;
  readonly repositoryId: string;
  readonly branch: string;
  readonly exactRevision: string;
  readonly protectedGraphId: string;
  readonly protectedGraphDigest: string;
  readonly templateId: GuidedReviewBuiltInTemplateV1["templateId"];
  readonly templateVersion: "1";
  readonly templateDigest: string;
  readonly kind: GuidedReviewBuiltInTemplateV1["kind"];
  readonly rationale: string;
  readonly risks: readonly string[];
  readonly acceptanceCriterionMappings: readonly GuidedReviewRouteAcMappingV1[];
  readonly inspectionPoints: readonly GuidedReviewRouteInspectionPointV1[];
  readonly overrides: readonly GuidedReviewRouteOverrideV1[];
  readonly furySeatId: "fury";
  readonly furyBindingRef: string;
  readonly furyReasoningRuntimeId: string;
  readonly furyModelId: string;
  readonly furyToolExecutorId: string;
  readonly identityAuthority: "claimed_only";
}

export interface GuidedReviewRouteOverlayV1 extends GuidedReviewRouteOverlayInputV1 {
  readonly overlayDigest: string;
}

export interface GuidedReviewCompiledRouteStepV1 {
  readonly stepId: string;
  readonly title: string;
  readonly question: string;
  readonly instructions: readonly string[];
  readonly criterionRefs: readonly string[];
  readonly relevantPaths: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly dependsOnStepIds: readonly string[];
}

export interface GuidedReviewCompiledRouteStageV1 {
  readonly stageId: string;
  readonly checkpointId: string;
  readonly title: string;
  readonly purpose: string;
  readonly steps: readonly GuidedReviewCompiledRouteStepV1[];
}

export interface GuidedReviewCompiledRouteV1 {
  readonly schemaVersion: 1;
  readonly contractVersion: "guided.review.compiled-route.v1";
  readonly overlay: GuidedReviewRouteOverlayV1;
  readonly template: GuidedReviewBuiltInTemplateV1;
  readonly stages: readonly GuidedReviewCompiledRouteStageV1[];
  readonly compiledRouteDigest: string;
}

export type GuidedReviewRouteResultV1<T> =
  | Readonly<{ state: "ready"; value: T }>
  | Readonly<{ state: "invalid"; code: string; errors: readonly string[] }>;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,255}$/u;
const REVISION = /^(?:sha256:[A-Za-z0-9_-]{6,}|[0-9a-f]{7,64})$/u;
const DIGEST = /^sha256:[A-Za-z0-9_-]{43}$/u;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/@# +:=,-]+$/u;
const INPUT_FIELDS = ["schemaVersion", "contractVersion", "overlayId", "missionId", "subjectId", "repositoryId", "branch", "exactRevision",
  "protectedGraphId", "protectedGraphDigest", "templateId", "templateVersion", "templateDigest", "kind", "rationale", "risks", "acceptanceCriterionMappings",
  "inspectionPoints", "overrides", "furySeatId", "furyBindingRef", "furyReasoningRuntimeId", "furyModelId", "furyToolExecutorId", "identityAuthority"] as const;

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function exact(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return plain(value) && Reflect.ownKeys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field));
}
function id(value: unknown): value is string { return typeof value === "string" && ID.test(value); }
function text(value: unknown, max = 4000): value is string {
  return typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= max;
}
function strings(value: unknown, validator: (entry: unknown) => entry is string, allowEmpty = true): value is readonly string[] {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.length <= 256 && value.every(validator) && new Set(value).size === value.length;
}
function digest(value: unknown): string { return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("base64url")}`; }
function snapshot<T>(value: T): T {
  const output = JSON.parse(canonicalJson(value)) as T;
  const freeze = (candidate: unknown): void => {
    if (candidate !== null && typeof candidate === "object") {
      for (const child of Object.values(candidate)) freeze(child);
      Object.freeze(candidate);
    }
  };
  freeze(output);
  return output;
}
function invalid<T>(code: string, error: string): GuidedReviewRouteResultV1<T> {
  return { state: "invalid", code, errors: Object.freeze([error]) };
}

function validMapping(value: unknown): value is GuidedReviewRouteAcMappingV1 {
  return exact(value, ["criterionId", "stepIds"]) && id(value.criterionId) && strings(value.stepIds, id, false);
}
function validInspection(value: unknown): value is GuidedReviewRouteInspectionPointV1 {
  return exact(value, ["inspectionPointId", "targetStepId", "title", "instructions", "relevantPaths", "evidenceRefs"]) &&
    id(value.inspectionPointId) && id(value.targetStepId) && text(value.title, 200) &&
    strings(value.instructions, (entry): entry is string => text(entry, 2000), false) &&
    strings(value.relevantPaths, (entry): entry is string => typeof entry === "string" && entry.length <= 512 && SAFE_PATH.test(entry)) &&
    strings(value.evidenceRefs, id);
}
function validOverride(value: unknown): value is GuidedReviewRouteOverrideV1 {
  if (!plain(value) || !text(value.rationale)) return false;
  if (value.operation === "remove") return exact(value, ["operation", "targetStepId", "rationale"]) && id(value.targetStepId);
  if (value.operation === "tighten") return exact(value, ["operation", "targetStepId", "additionalInstructions", "additionalRelevantPaths", "additionalEvidenceRefs", "rationale"]) &&
    id(value.targetStepId) && strings(value.additionalInstructions, (entry): entry is string => text(entry, 2000)) &&
    strings(value.additionalRelevantPaths, (entry): entry is string => typeof entry === "string" && entry.length <= 512 && SAFE_PATH.test(entry)) &&
    strings(value.additionalEvidenceRefs, id) &&
    value.additionalInstructions.length + value.additionalRelevantPaths.length + value.additionalEvidenceRefs.length > 0;
  return value.operation === "add_after" && exact(value, ["operation", "afterStepId", "stageId", "stepId", "title", "question", "instructions", "dependsOnStepIds", "rationale"]) &&
    id(value.afterStepId) && id(value.stageId) && id(value.stepId) && text(value.title, 200) && text(value.question, 500) &&
    value.question.endsWith("?") && (value.question.match(/\?/gu)?.length ?? 0) === 1 &&
    strings(value.instructions, (entry): entry is string => text(entry, 2000), false) && strings(value.dependsOnStepIds, id);
}

function resolveTemplate(value: GuidedReviewRouteOverlayInputV1): GuidedReviewBuiltInTemplateV1 | null {
  return BUILT_IN_GUIDED_REVIEW_TEMPLATE_REGISTRY_V1.find((entry) => entry.templateId === value.templateId &&
    entry.templateVersion === value.templateVersion && entry.templateDigest === value.templateDigest && entry.kind === value.kind) ?? null;
}

function overrideKey(value: GuidedReviewRouteOverrideV1): string {
  const phase = value.operation === "remove" ? "0" : value.operation === "tighten" ? "1" : "2";
  return value.operation === "add_after" ? `${phase}:${value.stageId}:${value.afterStepId}:${value.stepId}` : `${phase}:${value.targetStepId}`;
}

function normalizedOverlayInput(value: GuidedReviewRouteOverlayInputV1): GuidedReviewRouteOverlayInputV1 {
  return snapshot({
    ...value,
    risks: [...value.risks].sort(),
    acceptanceCriterionMappings: [...value.acceptanceCriterionMappings]
      .map((entry) => ({ ...entry, stepIds: [...entry.stepIds].sort() }))
      .sort((left, right) => left.criterionId.localeCompare(right.criterionId)),
    inspectionPoints: [...value.inspectionPoints]
      .map((entry) => ({ ...entry, relevantPaths: [...entry.relevantPaths].sort(), evidenceRefs: [...entry.evidenceRefs].sort() }))
      .sort((left, right) => left.targetStepId.localeCompare(right.targetStepId) || left.inspectionPointId.localeCompare(right.inspectionPointId)),
    overrides: [...value.overrides].map((entry) => entry.operation === "tighten"
      ? { ...entry, additionalRelevantPaths: [...entry.additionalRelevantPaths].sort(), additionalEvidenceRefs: [...entry.additionalEvidenceRefs].sort() }
      : entry.operation === "add_after" ? { ...entry, dependsOnStepIds: [...entry.dependsOnStepIds].sort() } : entry)
      .sort((left, right) => overrideKey(left).localeCompare(overrideKey(right))),
  });
}

function validOverlayInput(value: unknown): value is GuidedReviewRouteOverlayInputV1 {
  if (!exact(value, INPUT_FIELDS) || value.schemaVersion !== 1 || value.contractVersion !== GUIDED_REVIEW_ROUTE_OVERLAY_CONTRACT_VERSION ||
      !id(value.overlayId) || !id(value.missionId) || !id(value.subjectId) || typeof value.repositoryId !== "string" || !REPOSITORY.test(value.repositoryId) ||
      !id(value.branch) || typeof value.exactRevision !== "string" || !REVISION.test(value.exactRevision) || !id(value.protectedGraphId) ||
      typeof value.protectedGraphDigest !== "string" || !DIGEST.test(value.protectedGraphDigest) ||
      !id(value.templateId) || value.templateVersion !== "1" || typeof value.templateDigest !== "string" || !DIGEST.test(value.templateDigest) ||
      !["backend", "frontend", "spike"].includes(value.kind as string) || !text(value.rationale) ||
      !strings(value.risks, (entry): entry is string => text(entry, 2000)) || !Array.isArray(value.acceptanceCriterionMappings) ||
      value.acceptanceCriterionMappings.length === 0 || !value.acceptanceCriterionMappings.every(validMapping) ||
      new Set(value.acceptanceCriterionMappings.map((entry) => entry.criterionId)).size !== value.acceptanceCriterionMappings.length ||
      !Array.isArray(value.inspectionPoints) || !value.inspectionPoints.every(validInspection) ||
      new Set(value.inspectionPoints.map((entry) => entry.inspectionPointId)).size !== value.inspectionPoints.length ||
      !Array.isArray(value.overrides) || !value.overrides.every(validOverride) || value.furySeatId !== "fury" || !id(value.furyBindingRef) ||
      !id(value.furyReasoningRuntimeId) || !id(value.furyModelId) || !id(value.furyToolExecutorId) || value.identityAuthority !== "claimed_only") return false;
  const identities = [value.furyReasoningRuntimeId, value.furyModelId, value.furyToolExecutorId];
  if (new Set(identities).size !== identities.length || identities.includes("fury") || resolveTemplate(value as unknown as GuidedReviewRouteOverlayInputV1) === null) return false;
  const mutations = value.overrides.map((entry) => entry.operation === "add_after" ? `add:${entry.stepId}` : `target:${entry.targetStepId}`);
  return new Set(mutations).size === mutations.length;
}

export function createGuidedReviewRouteOverlayV1(input: unknown): GuidedReviewRouteResultV1<GuidedReviewRouteOverlayV1> {
  if (!validOverlayInput(input)) return invalid("MALFORMED_ROUTE_OVERLAY", "Guided Review route overlay is malformed, open, duplicated, or not pinned to a registered template.");
  const body = normalizedOverlayInput(input);
  return { state: "ready", value: snapshot({ ...body, overlayDigest: digest(body) }) };
}

export function validateGuidedReviewRouteOverlayV1(input: unknown): GuidedReviewRouteResultV1<GuidedReviewRouteOverlayV1> {
  if (!plain(input) || typeof input.overlayDigest !== "string" || !DIGEST.test(input.overlayDigest)) {
    return invalid("MALFORMED_ROUTE_OVERLAY", "Guided Review route overlay digest is absent or malformed.");
  }
  const { overlayDigest, ...body } = input;
  return validOverlayInput(body) && canonicalJson(body) === canonicalJson(normalizedOverlayInput(body)) && digest(body) === overlayDigest
    ? { state: "ready", value: snapshot(input as unknown as GuidedReviewRouteOverlayV1) }
    : invalid("MALFORMED_ROUTE_OVERLAY", "Guided Review route overlay shape, template binding, or digest is invalid.");
}

type MutableStep = {
  stepId: string; title: string; question: string; instructions: string[];
  criterionRefs: string[]; relevantPaths: string[]; evidenceRefs: string[]; dependsOnStepIds: string[];
};

export function compileGuidedReviewRouteV1(input: unknown): GuidedReviewRouteResultV1<GuidedReviewCompiledRouteV1> {
  const overlayResult = validateGuidedReviewRouteOverlayV1(input);
  if (overlayResult.state !== "ready") return invalid("INVALID_ROUTE_OVERLAY", "A valid content-addressed route overlay is required.");
  const overlay = overlayResult.value;
  const template = resolveTemplate(overlay);
  if (template === null) return invalid("TEMPLATE_SUBSTITUTED", "The pinned built-in template is unavailable or substituted.");
  const templateIds = new Set(template.stages.flatMap((stage) => stage.steps.map((step) => step.id)));
  const removes = overlay.overrides.filter((entry): entry is Extract<GuidedReviewRouteOverrideV1, { operation: "remove" }> => entry.operation === "remove")
    .sort((left, right) => left.targetStepId.localeCompare(right.targetStepId));
  const tightens = overlay.overrides.filter((entry): entry is Extract<GuidedReviewRouteOverrideV1, { operation: "tighten" }> => entry.operation === "tighten")
    .sort((left, right) => left.targetStepId.localeCompare(right.targetStepId));
  const additions = overlay.overrides.filter((entry): entry is Extract<GuidedReviewRouteOverrideV1, { operation: "add_after" }> => entry.operation === "add_after")
    .sort((left, right) => left.stageId.localeCompare(right.stageId) || left.afterStepId.localeCompare(right.afterStepId) || left.stepId.localeCompare(right.stepId));
  if ([...removes, ...tightens].some((entry) => !templateIds.has(entry.targetStepId)) || additions.some((entry) => !templateIds.has(entry.afterStepId))) {
    return invalid("UNKNOWN_OVERRIDE_TARGET", "Every override must target a step in the pinned template.");
  }
  if (removes.some((entry) => template.coreStepIds.includes(entry.targetStepId))) {
    return invalid("CORE_STEP_REMOVAL", "A protected core route step cannot be removed.");
  }
  const removed = new Set(removes.map((entry) => entry.targetStepId));
  const addedIds = additions.map((entry) => entry.stepId);
  if (new Set(addedIds).size !== addedIds.length || addedIds.some((stepId) => templateIds.has(stepId))) {
    return invalid("DUPLICATE_STEP", "Overlay-added step IDs must be unique and must not rewrite template steps.");
  }
  const tightenByTarget = new Map(tightens.map((entry) => [entry.targetStepId, entry]));
  const templateDependencies = new Map(template.stages.flatMap((stage) => stage.steps.map((step) => [step.id, [...(step.dependsOn ?? [])]] as const)));
  const resolveTemplateDependencies = (dependencies: readonly string[], seen = new Set<string>()): string[] => {
    const resolved: string[] = [];
    for (const dependency of dependencies) {
      if (!removed.has(dependency)) { resolved.push(dependency); continue; }
      if (seen.has(dependency)) continue;
      const nextSeen = new Set(seen).add(dependency);
      resolved.push(...resolveTemplateDependencies(templateDependencies.get(dependency) ?? [], nextSeen));
    }
    return [...new Set(resolved)];
  };
  const additionsByAnchor = new Map<string, typeof additions>();
  for (const addition of additions) additionsByAnchor.set(addition.afterStepId, [...(additionsByAnchor.get(addition.afterStepId) ?? []), addition]);
  const stages: Array<{ stageId: string; title: string; purpose: string; steps: MutableStep[] }> = [];
  for (const stage of template.stages) {
    const steps: MutableStep[] = [];
    for (const step of stage.steps) {
      if (removed.has(step.id)) continue;
      const tighten = tightenByTarget.get(step.id);
      steps.push({ stepId: step.id, title: step.title, question: step.question,
        instructions: [...step.instructions, ...(tighten?.additionalInstructions ?? [])], criterionRefs: [],
        relevantPaths: [...(tighten?.additionalRelevantPaths ?? [])], evidenceRefs: [...(tighten?.additionalEvidenceRefs ?? [])],
        dependsOnStepIds: resolveTemplateDependencies(step.dependsOn ?? []) });
      for (const addition of additionsByAnchor.get(step.id) ?? []) {
        if (addition.stageId !== stage.id) return invalid("CROSS_STAGE_INSERTION", "An added step must stay in its anchor step's stage.");
        steps.push({ stepId: addition.stepId, title: addition.title, question: addition.question,
          instructions: [...addition.instructions], criterionRefs: [], relevantPaths: [], evidenceRefs: [],
          dependsOnStepIds: [...addition.dependsOnStepIds] });
      }
    }
    stages.push({ stageId: stage.id, title: stage.title, purpose: stage.purpose, steps });
  }
  const steps = stages.flatMap((stage) => stage.steps);
  const stepById = new Map(steps.map((step) => [step.stepId, step]));
  const positions = new Map(steps.map((step, index) => [step.stepId, index]));
  if (steps.some((step) => step.dependsOnStepIds.some((dependency) => !stepById.has(dependency)))) {
    return invalid("DANGLING_DEPENDENCY", "Removing or adding a step left a dangling dependency.");
  }
  if (steps.some((step) => step.dependsOnStepIds.some((dependency) => (positions.get(dependency) ?? Infinity) >= (positions.get(step.stepId) ?? -1)))) {
    return invalid("FORWARD_OR_CYCLIC_DEPENDENCY", "Compiled route dependencies must point to earlier visible steps.");
  }
  for (const mapping of overlay.acceptanceCriterionMappings) {
    const targets = mapping.stepIds.filter((stepId) => stepById.has(stepId));
    if (targets.length === 0 || targets.length !== mapping.stepIds.length) return invalid("UNCOVERED_ACCEPTANCE_CRITERION", "Every mapped acceptance criterion must retain all named route steps.");
    for (const stepId of targets) stepById.get(stepId)?.criterionRefs.push(mapping.criterionId);
  }
  for (const inspection of [...overlay.inspectionPoints].sort((left, right) => left.targetStepId.localeCompare(right.targetStepId) || left.inspectionPointId.localeCompare(right.inspectionPointId))) {
    const target = stepById.get(inspection.targetStepId);
    if (target === undefined) return invalid("UNKNOWN_INSPECTION_TARGET", "Every inspection point must target a compiled route step.");
    target.instructions.push(`Inspection point ${inspection.inspectionPointId}: ${inspection.title}`, ...inspection.instructions);
    target.relevantPaths.push(...inspection.relevantPaths);
    target.evidenceRefs.push(...inspection.evidenceRefs);
  }
  const compiledStages = snapshot(stages.map((stage) => ({ ...stage, checkpointId: `checkpoint:${stage.stageId}`,
    steps: stage.steps.map((step) => ({ ...step, criterionRefs: [...new Set(step.criterionRefs)].sort(),
      relevantPaths: [...new Set(step.relevantPaths)].sort(), evidenceRefs: [...new Set(step.evidenceRefs)].sort() })) })));
  const body = snapshot({ schemaVersion: 1 as const, contractVersion: "guided.review.compiled-route.v1" as const, overlay, template, stages: compiledStages });
  const compiledRouteDigest = digest({ overlayId: overlay.overlayId, overlayDigest: overlay.overlayDigest, stages: compiledStages });
  return { state: "ready", value: snapshot({ ...body, compiledRouteDigest }) };
}

export function validateGuidedReviewCompiledRouteV1(input: unknown): GuidedReviewRouteResultV1<GuidedReviewCompiledRouteV1> {
  if (!exact(input, ["schemaVersion", "contractVersion", "overlay", "template", "stages", "compiledRouteDigest"]) ||
      input.schemaVersion !== 1 || input.contractVersion !== "guided.review.compiled-route.v1" || typeof input.compiledRouteDigest !== "string" || !DIGEST.test(input.compiledRouteDigest)) {
    return invalid("MALFORMED_COMPILED_ROUTE", "Compiled Guided Review route is malformed or not closed.");
  }
  const recomputed = compileGuidedReviewRouteV1(input.overlay);
  return recomputed.state === "ready" && canonicalJson(recomputed.value) === canonicalJson(input)
    ? { state: "ready", value: snapshot(input as unknown as GuidedReviewCompiledRouteV1) }
    : invalid("MALFORMED_COMPILED_ROUTE", "Compiled Guided Review route identity, stages, or digest is substituted.");
}

export function createFormalGuidedReviewPlaybookV1(
  compiledRouteInput: unknown,
  input: BuiltInGuidedReviewInputV1,
): GuidedReviewResultV1<GuidedReviewPlaybookV1> {
  const compiled = validateGuidedReviewCompiledRouteV1(compiledRouteInput);
  if (compiled.state !== "ready") return { state: "invalid", code: compiled.code, errors: compiled.errors };
  const { overlay, template, stages } = compiled.value;
  if (overlay.missionId !== input.missionId || overlay.subjectId !== input.subjectId || overlay.repositoryId !== input.repositoryId ||
      overlay.branch !== input.branch || overlay.exactRevision !== input.exactRevision || template.kind !== input.plan.kind) {
    return { state: "invalid", code: "COMPILED_ROUTE_BINDING_MISMATCH", errors: Object.freeze(["Compiled route does not bind the requested formal playbook candidate."]) };
  }
  const mappedCriterionIds = [...new Set(overlay.acceptanceCriterionMappings.map((mapping) => mapping.criterionId))].sort();
  const suppliedCriterionIds = [...new Set(input.acceptanceCriteria.map((criterion) => criterion.criterionId))].sort();
  if (canonicalJson(mappedCriterionIds) !== canonicalJson(suppliedCriterionIds)) {
    return { state: "invalid", code: "COMPILED_ROUTE_CRITERIA_MISMATCH", errors: Object.freeze(["Fury's compiled route must map every formal playbook acceptance criterion exactly."]) };
  }
  return createGuidedReviewPlaybookV1({
    schemaVersion: 1,
    contractVersion: GUIDED_REVIEW_CONTRACT_VERSION,
    playbookId: template.templateId,
    kind: template.kind,
    title: input.title,
    missionId: input.missionId,
    subjectId: input.subjectId,
    repositoryId: input.repositoryId,
    branch: input.branch,
    exactRevision: input.exactRevision,
    plan: input.plan,
    participantRelationship: input.participantRelationship,
    acceptanceCriteria: input.acceptanceCriteria,
    runtimeHandoff: input.runtimeHandoff,
    overlayId: overlay.overlayId,
    overlayDigest: overlay.overlayDigest,
    compiledRouteDigest: compiled.value.compiledRouteDigest,
    stages,
  });
}
