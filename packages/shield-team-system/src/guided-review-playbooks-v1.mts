import {
  GUIDED_REVIEW_CONTRACT_VERSION,
  createGuidedReviewPlaybookV1,
  type GuidedReviewCriterionV1,
  type GuidedReviewPlaybookKindV1,
  type GuidedReviewPlanV1,
  type GuidedReviewPlaybookV1,
  type GuidedReviewResultV1,
  type GuidedReviewRuntimeHandoffV1,
  type GuidedReviewStageV1,
} from "./guided-review-v1.mjs";

export const BUILT_IN_GUIDED_REVIEW_PLAYBOOK_IDS = [
  "guided-review:product-qa:v1",
  "guided-review:code:v1",
  "guided-review:document-spike:v1",
] as const;

export interface BuiltInGuidedReviewInputV1 {
  readonly missionId: string;
  readonly subjectId: string;
  readonly repositoryId: string;
  readonly branch: string;
  readonly exactRevision: string;
  readonly plan: GuidedReviewPlanV1;
  readonly title: string;
  readonly acceptanceCriteria: readonly GuidedReviewCriterionV1[];
  readonly runtimeHandoff: GuidedReviewRuntimeHandoffV1;
  readonly relevantPaths: readonly string[];
  readonly evidenceRefs: readonly string[];
}

type StepTemplate = Readonly<{
  id: string;
  title: string;
  question: string;
  instructions: readonly string[];
  dependsOn?: readonly string[];
}>;

type StageTemplate = Readonly<{
  id: string;
  title: string;
  purpose: string;
  steps: readonly StepTemplate[];
}>;

const PRODUCT_QA: readonly StageTemplate[] = Object.freeze([
  {
    id: "mission-briefing", title: "Mission Briefing", purpose: "Understand the ticket intent before exercising behavior.", steps: [
      { id: "intent", title: "Ticket intent", question: "Does the stated behavior match the ticket intent?", instructions: ["Read the ticket summary and acceptance criteria.", "Compare them with the candidate summary."] },
      { id: "route", title: "Review route", question: "Are the selected user journey and test data representative?", instructions: ["Confirm the persona, starting state, and fixture.", "Do not treat environment setup as product behavior."], dependsOn: ["intent"] },
    ],
  },
  {
    id: "field-test", title: "Field Test", purpose: "Observe representative success, failure, and recovery behavior.", steps: [
      { id: "success", title: "Success behavior", question: "Does the representative success path satisfy its acceptance criteria?", instructions: ["Perform the user action.", "Record what appeared and what changed."], dependsOn: ["route"] },
      { id: "failure", title: "Failure behavior", question: "Is the representative failure behavior safe and understandable?", instructions: ["Exercise the approved failure case.", "Confirm data is retained and the message supports recovery."], dependsOn: ["success"] },
      { id: "recovery", title: "Recovery behavior", question: "Can the user recover without an unintended side effect?", instructions: ["Perform the documented recovery action.", "Confirm external effects remain within policy."], dependsOn: ["failure"] },
    ],
  },
  {
    id: "evidence-pass", title: "Evidence Pass", purpose: "Connect human observations to durable automated evidence.", steps: [
      { id: "regression", title: "Regression evidence", question: "Do the reviewed tests prove the important behavior without replacing human observation?", instructions: ["Inspect the focused automated coverage.", "Distinguish technical GREEN from the human observation."], dependsOn: ["recovery"] },
      { id: "qa-checklist", title: "Reusable QA checklist", question: "Will the generated checklist let another QA reviewer repeat the important checks?", instructions: ["Review each checklist item for observable outcomes.", "Keep environment instructions separate from product expectations."], dependsOn: ["regression"] },
    ],
  },
  {
    id: "publication-gate", title: "Publication Gate", purpose: "Carry the actual journey and exact candidate to publication.", steps: [
      { id: "product-recap", title: "Product recap", question: "Does the recap accurately retain findings, corrections, and conditions?", instructions: ["Review open findings and carried conditions.", "Confirm no acceptance criterion is silently unobserved."], dependsOn: ["qa-checklist"] },
      { id: "exact-candidate", title: "Exact candidate", question: "Is this the exact candidate you exercised and intend to send forward?", instructions: ["Compare the displayed exact revision with the reviewed candidate.", "Do not infer merge, deploy, or release authority."], dependsOn: ["product-recap"] },
    ],
  },
]);

const CODE: readonly StageTemplate[] = Object.freeze([
  {
    id: "mission-briefing", title: "Mission Briefing", purpose: "Establish intent, scope, and the reviewer relationship.", steps: [
      { id: "intent", title: "Intent and ACs", question: "Does the implementation claim map clearly to the ticket and acceptance criteria?", instructions: ["Read the ticket and candidate summary.", "Identify the code expected to carry each behavior."] },
      { id: "scope", title: "Change scope", question: "Is the changed surface bounded to the authorized objective?", instructions: ["Inspect the exact candidate diff.", "Record unrelated or unexplained changes as findings."], dependsOn: ["intent"] },
    ],
  },
  {
    id: "implementation-pass", title: "Implementation Pass", purpose: "Understand the responsible code and its effects.", steps: [
      { id: "design", title: "Design fit", question: "Does the implementation fit the repository architecture and ownership boundaries?", instructions: ["Trace entry points and dependencies.", "Check that responsibilities sit at the intended layer."], dependsOn: ["scope"] },
      { id: "effects", title: "State and effects", question: "Are state changes, external effects, and failure boundaries explicit and safe?", instructions: ["Trace success and failure paths.", "Check authorization, idempotency, and recovery where relevant."], dependsOn: ["design"] },
      { id: "maintainability", title: "Maintainability", question: "Can another developer safely understand and change this code?", instructions: ["Review naming, contracts, duplication, and explanatory comments.", "Prefer evidence over style-only preference."], dependsOn: ["effects"] },
    ],
  },
  {
    id: "validation-pass", title: "Validation Pass", purpose: "Understand what the automated evidence proves and misses.", steps: [
      { id: "tests", title: "Test meaning", question: "Do the tests cover representative success, failure, and regression behavior?", instructions: ["Read focused assertions, not only check status.", "Identify important untested boundaries."], dependsOn: ["maintainability"] },
      { id: "green", title: "Exact-revision GREEN", question: "Is independent GREEN evidence bound to this exact candidate?", instructions: ["Verify command, outcome, and exact revision.", "Treat environment or malformed-test failures separately from product defects."], dependsOn: ["tests"] },
    ],
  },
  {
    id: "review-disposition", title: "Review Disposition", purpose: "Record a named exact-revision technical disposition.", steps: [
      { id: "limitations", title: "Risks and limitations", question: "Are remaining risks, limitations, and follow-ups stated accurately?", instructions: ["Review carried conditions and unresolved findings.", "Do not hide scope expansion inside a follow-up note."], dependsOn: ["green"] },
      { id: "exact-candidate", title: "Exact candidate", question: "Can you approve this exact candidate for its next configured gate?", instructions: ["Compare the exact revision with reviewed evidence.", "This does not grant merge, deploy, release, or another seat's authority."], dependsOn: ["limitations"] },
    ],
  },
]);

const DOCUMENT: readonly StageTemplate[] = Object.freeze([
  {
    id: "placement-purpose", title: "Placement and Purpose", purpose: "Confirm where the document belongs and what decision it supports.", steps: [
      { id: "placement", title: "Placement", question: "Is the proposed location discoverable beside the relevant source material?", instructions: ["Inspect the destination hierarchy and neighboring documents.", "Record exact folder and page links as evidence."] },
      { id: "purpose", title: "Purpose", question: "Does the document state its purpose without claiming broader implementation authority?", instructions: ["Read the title, scope, and audience.", "Separate evaluated findings from future service design."], dependsOn: ["placement"] },
    ],
  },
  {
    id: "findings-pass", title: "Findings Pass", purpose: "Review evidence and ticket coverage in small, durable decisions.", steps: [
      { id: "summary", title: "Executive summary", question: "Does the summary state the recommendation and its rationale clearly?", instructions: ["Review the proposed message in isolation.", "Check that conditional recommendations remain conditional."], dependsOn: ["purpose"] },
      { id: "ac-mapping", title: "Acceptance mapping", question: "Does every ticket acceptance criterion map to a finding or named gap?", instructions: ["Compare the ticket ACs with the mapping table.", "Record unevaluated capability as a limitation, not a PASS."], dependsOn: ["summary"] },
      { id: "examples", title: "Linked examples", question: "Do example links open the correct folders and files for each evaluated option?", instructions: ["Open representative samples and source folders.", "Confirm labels distinguish each POC."], dependsOn: ["ac-mapping"] },
    ],
  },
  {
    id: "recommendation-pass", title: "Recommendation Pass", purpose: "Understand tradeoffs, evidence, and conditions that survive publication.", steps: [
      { id: "comparison", title: "Comparison", question: "Are advantages, disadvantages, maintainability, and developer experience compared fairly?", instructions: ["Inspect the scorecard and narrative together.", "Clarify ambiguous measures such as byte versus semantic determinism."], dependsOn: ["examples"] },
      { id: "conditions", title: "Conditions", question: "Are discovered opportunities and Product-dependent choices carried as named conditions?", instructions: ["Review visual-authoring and ownership findings.", "Distinguish original requirements from opportunities discovered during the spike."], dependsOn: ["comparison"] },
    ],
  },
  {
    id: "publication-gate", title: "Publication Gate", purpose: "Publish a reusable, evidence-linked decision record.", steps: [
      { id: "document-recap", title: "Document recap", question: "Does the final document preserve every accepted correction, limitation, and condition?", instructions: ["Review the accumulated journey recap.", "Confirm no finding disappeared between stages."], dependsOn: ["conditions"] },
      { id: "exact-candidate", title: "Exact candidate", question: "Is this the exact document revision you intend to publish?", instructions: ["Compare the exact revision and linked artifacts.", "Publication authority remains a separate final effect."], dependsOn: ["document-recap"] },
    ],
  },
]);

function stages(
  templates: readonly StageTemplate[],
  input: BuiltInGuidedReviewInputV1,
): readonly GuidedReviewStageV1[] {
  const criterionRefs = input.acceptanceCriteria.map((criterion) => criterion.criterionId);
  return templates.map((stage) => ({
    stageId: stage.id,
    checkpointId: `checkpoint:${stage.id}`,
    title: stage.title,
    purpose: stage.purpose,
    steps: stage.steps.map((step) => ({
      stepId: step.id,
      title: step.title,
      question: step.question,
      instructions: step.instructions,
      criterionRefs,
      evidenceRefs: input.evidenceRefs,
      relevantPaths: input.relevantPaths,
      dependsOnStepIds: step.dependsOn ?? [],
    })),
  }));
}

export function createBuiltInGuidedReviewPlaybookV1(
  kind: GuidedReviewPlaybookKindV1,
  input: BuiltInGuidedReviewInputV1,
): GuidedReviewResultV1<GuidedReviewPlaybookV1> {
  const definition = kind === "product_qa"
    ? { playbookId: BUILT_IN_GUIDED_REVIEW_PLAYBOOK_IDS[0], participantRelationship: "product_reviewer" as const, templates: PRODUCT_QA }
    : kind === "code"
      ? { playbookId: BUILT_IN_GUIDED_REVIEW_PLAYBOOK_IDS[1], participantRelationship: "independent_reviewer" as const, templates: CODE }
      : { playbookId: BUILT_IN_GUIDED_REVIEW_PLAYBOOK_IDS[2], participantRelationship: "document_reviewer" as const, templates: DOCUMENT };
  return createGuidedReviewPlaybookV1({
    schemaVersion: 1,
    contractVersion: GUIDED_REVIEW_CONTRACT_VERSION,
    playbookId: definition.playbookId,
    kind,
    title: input.title,
    missionId: input.missionId,
    subjectId: input.subjectId,
    repositoryId: input.repositoryId,
    branch: input.branch,
    exactRevision: input.exactRevision,
    plan: input.plan,
    participantRelationship: definition.participantRelationship,
    acceptanceCriteria: input.acceptanceCriteria,
    runtimeHandoff: input.runtimeHandoff,
    stages: stages(definition.templates, input),
  });
}
