const dimensions = [
  ["scope_completeness", "satisfied"],
  ["authority_safety", "refinement_required"],
  ["contract_consistency", "refinement_required"],
  ["implementation_boundedness", "satisfied"],
  ["validation_readiness", "refinement_required"],
  ["operational_completeness", "refinement_required"],
  ["ownership_continuity", "satisfied"],
  ["escalation_fitness", "satisfied"],
].map(([dimension, status]) => ({
  dimension,
  status,
  evidenceRefs: [`github:issue:34#${dimension}`],
  operationalNotApplicableRationale: null,
}));

export const ISSUE_34_RETROSPECTIVE_FIXTURE = Object.freeze({
  fixtureKind: "retrospective_observation",
  predictionEligible: false,
  sourceRefs: Object.freeze([
    "github:issue:34",
    "github:pr:57",
    "github:issue:34#after-action-report",
  ]),
  candidate: Object.freeze({
    readinessContractVersion: 1,
    missionId: "mission:issue-34",
    subjectId: "mission-brief:issue-34",
    revisionId: "retrospective:issue-34:brief-v1",
    artifactKind: "mission_brief",
    owningSeatId: "may",
    dimensions: Object.freeze(dimensions.map((dimension) => Object.freeze({
      ...dimension,
      evidenceRefs: Object.freeze([...dimension.evidenceRefs]),
    }))),
  }),
  hostObservation: Object.freeze({
    observationContractVersion: 1,
    assuranceKind: "host_asserted_non_authoritative",
    missionId: "mission:issue-34",
    subjectId: "mission-brief:issue-34",
    currentRevisionId: "retrospective:issue-34:brief-v1",
    artifactKind: "mission_brief",
    owningSeatId: "may",
    journalSchemaVersion: 6,
    evaluatedThroughSequence: 0,
    journalHeadEntryId: "retrospective:issue-34:journal-head",
    refinementPassesCompleted: 0,
    reasoningRuntimeId: null,
    toolExecutorId: null,
  }),
  expectedOutcome: "NEEDS_REFINEMENT",
});
