import {
  canonicalCloneV1,
  deepFreeze,
  invalidResult,
  readExactArgumentV1,
  validResult,
  type PreparationValidationResultV1,
} from "./canonical-json-v1.mjs";
import {
  createCandidateV1,
  createReceiptV1,
  createSelectionV1,
  validateFreshAuthorizeWheelsUpCandidateV1,
  validateFreshAuthorizeWheelsUpObservationV1,
  validateNextTransitionSelectionV1,
  validateParentPlanReviewEvidenceV1,
  validatePreparationReceiptV1,
  validateTransitionIntentV1,
  validateTransitionPlanV1,
  type FreshAuthorizeWheelsUpCandidateV1,
  type FreshAuthorizeWheelsUpObservationV1,
  type NextTransitionSelectionV1,
  type ParentPlanReviewEvidenceV1,
  type PreparationReasonCodeV1,
  type PreparationReceiptV1,
  type TransitionIntentV1,
  type TransitionPlanV1,
} from "./contracts-v1.mjs";

export type SelectNextTransitionInputV1 = Readonly<{
  plan: unknown;
  reviewEvidence: unknown;
  intent: unknown;
  observation: unknown;
}>;

export type CompileFreshAuthorizeWheelsUpCandidateInputV1 = Readonly<{
  plan: unknown;
  reviewEvidence: unknown;
  intent: unknown;
  observation: unknown;
  selection: unknown;
}>;

export type PrepareMissionTransitionInputV1 = SelectNextTransitionInputV1;

export type SelectNextTransitionResultV1 =
  | Readonly<{
      state: "invalid";
      reasonCode: "invalid_preparation_input";
      errors: readonly string[];
    }>
  | Readonly<{ state: "selected"; selection: NextTransitionSelectionV1 }>;

export type PrepareMissionTransitionResultV1 =
  | Readonly<{
      state: "invalid";
      reasonCode: "invalid_preparation_input";
      errors: readonly string[];
    }>
  | Readonly<{ state: "blocked"; selection: NextTransitionSelectionV1 }>
  | Readonly<{
      state: "ready";
      selection: NextTransitionSelectionV1;
      candidate: FreshAuthorizeWheelsUpCandidateV1;
      receipt: PreparationReceiptV1;
    }>;

type ValidatedInputs = Readonly<{
  plan: TransitionPlanV1;
  review: ParentPlanReviewEvidenceV1;
  intent: TransitionIntentV1;
  observation: FreshAuthorizeWheelsUpObservationV1;
}>;

function closedInput(input: unknown, keys: readonly string[]): PreparationValidationResultV1<Record<string, unknown>> {
  const argument = readExactArgumentV1(input, keys);
  if (argument.state === "invalid") return invalidResult("Preparation argument has unexpected fields.");
  return argument;
}

function validateInputs(input: unknown): PreparationValidationResultV1<ValidatedInputs> {
  const argument = closedInput(input, ["plan", "reviewEvidence", "intent", "observation"]);
  if (argument.state === "invalid") return argument;
  const plan = validateTransitionPlanV1({ artifact: argument.value.plan });
  const review = validateParentPlanReviewEvidenceV1({ artifact: argument.value.reviewEvidence });
  const intent = validateTransitionIntentV1({ artifact: argument.value.intent });
  const observation = validateFreshAuthorizeWheelsUpObservationV1({ artifact: argument.value.observation });
  const errors = [plan, review, intent, observation].flatMap((result) => result.state === "invalid" ? result.errors : []);
  if (plan.state === "invalid" || review.state === "invalid" || intent.state === "invalid" || observation.state === "invalid") {
    return invalidResult(...errors);
  }
  return validResult({ plan: plan.value, review: review.value, intent: intent.value, observation: observation.value });
}

const MISSION_PARTICIPANT_IDS = new Set(["hill", "daisy", "fury", "may", "mack", "coulson", "fitz", "simmons"]);

function reviewedPlanMismatch({ plan, review, intent, observation }: ValidatedInputs): boolean {
  const mayIdentities = ["may", plan.reasoningRuntimeId, plan.modelId, plan.toolExecutorId];
  return review.repositoryId !== plan.repositoryId || review.planningBaseRevision !== plan.planningBaseRevision || review.parentPlanCommit !== plan.parentPlanCommit ||
    review.parentPlanPath !== plan.parentPlanPath || review.parentPlanRawSha256 !== plan.parentPlanRawSha256 || review.transitionPlanId !== plan.id || review.transitionPlanDigest !== plan.digest ||
    intent.missionId !== plan.missionId || intent.subjectId !== plan.subjectId || intent.repositoryId !== plan.repositoryId || intent.planningBaseRevision !== plan.planningBaseRevision ||
    intent.transitionPlanId !== plan.id || intent.transitionPlanDigest !== plan.digest || intent.parentReviewEvidenceId !== review.id || intent.parentReviewEvidenceDigest !== review.digest ||
    observation.missionId !== plan.missionId || observation.subjectId !== plan.subjectId || observation.repositoryId !== plan.repositoryId || observation.planningBaseRevision !== plan.planningBaseRevision ||
    new Set(mayIdentities).size !== mayIdentities.length || mayIdentities.slice(1).some((identity) => MISSION_PARTICIPANT_IDS.has(identity));
}

function repositoryObservationStale(plan: TransitionPlanV1, observation: FreshAuthorizeWheelsUpObservationV1): boolean {
  return observation.branch === "HEAD" || observation.baseRevision !== plan.planningBaseRevision || observation.headRevision === observation.baseRevision || !observation.baseAncestor || !observation.workspaceClean ||
    JSON.stringify(observation.changedPaths) !== JSON.stringify(plan.publicationPaths) || observation.symlinkPaths.length !== 0 || observation.gitlinkPaths.length !== 0;
}

function freshStateIneligible(observation: FreshAuthorizeWheelsUpObservationV1): boolean {
  return observation.missionSchemaVersion !== 9 || observation.authorizationState !== "waiting" || observation.implementationAuthorityState !== "waiting" ||
    observation.finalAcceptanceState !== "waiting" || observation.executionState !== "not-started" || observation.implementationAuthorityCount !== 0 ||
    observation.runtimeBindingCount !== 0 || observation.activeRuntimeBindingCount !== 0 || observation.publicationAuthorizationCount !== 0 ||
    observation.pendingCoulsonMissionAuthorizationCount !== 1;
}

function freshnessIncomplete(observation: FreshAuthorizeWheelsUpObservationV1): boolean {
  const ordinaryGates = ["coulson.final_acceptance", "fitz.technical_review"];
  const simmonsGates = [...ordinaryGates, "simmons.product_domain_review"];
  const gates = JSON.stringify(observation.remainingHumanGates);
  return observation.signerBindingMatchCount !== 1 || observation.signerBindingId === null || observation.signingKeyRef === null ||
    (gates !== JSON.stringify(ordinaryGates) && gates !== JSON.stringify(simmonsGates));
}

function reason(inputs: ValidatedInputs): Exclude<PreparationReasonCodeV1, "invalid_preparation_input"> | null {
  if (reviewedPlanMismatch(inputs)) return "reviewed_plan_mismatch";
  if (inputs.review.verdict !== "PASS" || inputs.review.attributionClass === "synthetic_test") return "parent_plan_review_ineligible";
  if (repositoryObservationStale(inputs.plan, inputs.observation)) return "repository_observation_stale";
  if (freshStateIneligible(inputs.observation)) return "fresh_wheels_up_state_ineligible";
  if (freshnessIncomplete(inputs.observation)) return "freshness_evidence_incomplete";
  return null;
}

export function selectNextTransitionV1(input: SelectNextTransitionInputV1): SelectNextTransitionResultV1 {
  const validated = validateInputs(input);
  if (validated.state === "invalid") return validated;
  return deepFreeze({ state: "selected" as const, selection: createSelectionV1(validated.value.intent, validated.value.observation, reason(validated.value)) });
}

export function compileFreshAuthorizeWheelsUpCandidateV1(
  input: CompileFreshAuthorizeWheelsUpCandidateInputV1,
): PreparationValidationResultV1<FreshAuthorizeWheelsUpCandidateV1> {
  const argument = closedInput(input, ["plan", "reviewEvidence", "intent", "observation", "selection"]);
  if (argument.state === "invalid") return argument;
  const validated = validateInputs({
    plan: argument.value.plan,
    reviewEvidence: argument.value.reviewEvidence,
    intent: argument.value.intent,
    observation: argument.value.observation,
  });
  const selection = validateNextTransitionSelectionV1({ artifact: argument.value.selection });
  if (validated.state === "invalid" || selection.state === "invalid") return invalidResult(...(validated.state === "invalid" ? validated.errors : []), ...(selection.state === "invalid" ? selection.errors : []));
  const expected = createSelectionV1(validated.value.intent, validated.value.observation, reason(validated.value));
  if (selection.value.state !== "ready" || selection.value.id !== expected.id || selection.value.digest !== expected.digest) return invalidResult("Selection is not the bound ready selection.");
  const candidate = createCandidateV1(validated.value.plan, validated.value.review, validated.value.intent, validated.value.observation, selection.value);
  const checked = validateFreshAuthorizeWheelsUpCandidateV1({ artifact: candidate });
  return checked.state === "valid" ? checked : invalidResult(...checked.errors);
}

export function prepareMissionTransitionV1(input: PrepareMissionTransitionInputV1): PrepareMissionTransitionResultV1 {
  const validated = validateInputs(input);
  if (validated.state === "invalid") return validated;
  const selection = createSelectionV1(validated.value.intent, validated.value.observation, reason(validated.value));
  if (selection.state === "blocked") return deepFreeze({ state: "blocked" as const, selection });
  const candidate = createCandidateV1(validated.value.plan, validated.value.review, validated.value.intent, validated.value.observation, selection);
  const checkedCandidate = validateFreshAuthorizeWheelsUpCandidateV1({ artifact: candidate });
  if (checkedCandidate.state === "invalid") return checkedCandidate;
  const receipt = createReceiptV1(validated.value.plan, validated.value.review, validated.value.intent, validated.value.observation, selection, checkedCandidate.value);
  const checkedReceipt = validatePreparationReceiptV1({ artifact: receipt });
  if (checkedReceipt.state === "invalid") return checkedReceipt;
  return deepFreeze({ state: "ready" as const, selection, candidate: checkedCandidate.value, receipt: checkedReceipt.value });
}
