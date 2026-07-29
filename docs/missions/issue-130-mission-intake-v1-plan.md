# Mission #130 — `missionIntake v1` Implementation Plan

## Status

Advisory Fury architecture review returned `APPROVE` on exact revision
`f10043ca749ba8f0f1d19a38907462efd5d9c41e` after three revise-and-return
cycles. The review was host-dispatched rather than a formal journaled
`fury.plan-gate.v1` record. This artifact and verdict authorize no
implementation by themselves; the route is now the human sponsor gate.

## Public position

Add one supported package entry point:

```text
@shield/team-system/intake
```

Freeze the public function symbol as:

```ts
missionIntakeV1(request: MissionIntakeRequestV1): MissionIntakeResultV1
```

The runtime source should be a new cohesive module:

```text
src/mission-intake-v1.mts
```

The module composes existing public/runtime contracts. It must not import CLI,
GitHub publication, runner, Helicarrier, permission-executor, or local-model
code.

## Contract constants

```ts
MISSION_INTAKE_SCHEMA_VERSION = 1
MISSION_INTAKE_CONTRACT_VERSION = "mission.intake.v1"
```

## Closed request

```ts
interface MissionIntakeRequestV1 {
  schemaVersion: 1;
  contractVersion: "mission.intake.v1";
  configObservation:
    | {
        source: "repository_file";
        observationState: "observed";
        assuranceKind: "host_asserted";
        observedAt: string;
        sourceRef: string;
        repositoryRevision: string;
        config: unknown;
      }
    | {
        source: "bootstrap_input";
        observationState: "provided_not_repository_observed";
        assuranceKind: "human_recorded";
        observedAt: string;
        sourceRef: string;
        config: unknown;
      }
    | {
        source: "repository_file";
        observationState: "missing";
        assuranceKind: "host_asserted";
        observedAt: string;
        sourceRef: string;
        repositoryRevision: string;
      };
  repositoryObservation: {
    assuranceKind: "host_asserted";
    repositoryId: string;
    branch: string;
    baseRevision: string;
    headRevision: string;
    observedAt: string;
    sourceRef: string;
  };
  issueObservation: {
    assuranceKind: "host_asserted";
    issueId: string;
    issueRevisionId: string;
    observedAt: string;
    sourceRef: string;
  };
  proposedBrief: {
    missionId: string;
    objective: string;
    subjectId: string;
    riskFlags: unknown;
    participantSeatIds: unknown;
    requireSimmons: boolean;
    createdAt: {
      value: string;
      provenance: "hostTrusted" | "humanRecorded";
    };
  };
  recommendedModes: unknown;
  artifacts: {
    missionBrief: {
      path: string;
      repositoryRevision: string;
      verification: "content_unverified";
    };
    missionCommunication: {
      path: string;
      repositoryRevision: string;
      verification: "content_unverified";
    };
    sharedRuntimeInstructions: {
      path: string;
      repositoryRevision: string;
      verification: "content_unverified";
    };
  };
  runtimeObservations: unknown;
}
```

The request is a closed plain-data object. Unknown, inherited, accessor-backed,
duplicate, malformed, or oversized fields fail closed. V1 accepts no callback,
filesystem path root, executable, model client, tool implementation, adapter,
or persistence function.

Before any existing constructor or evaluator reads request data, v1 performs
descriptor-safe normalization. It rejects accessors, hostile proxies, sparse
arrays, symbols, non-plain prototypes, and extra array properties. A malformed
risk object maps to `INVALID_BRIEF_INPUT`, not to a high-risk candidate.

`proposedBrief.subjectId` must exactly equal `issueObservation.issueId`.
Every artifact `repositoryRevision` must exactly equal
`repositoryObservation.headRevision`. Repository, issue, configuration, and
artifact assertion provenance is preserved in the result.

When `configObservation.source` is `repository_file`, its
`repositoryRevision` must exactly equal `repositoryObservation.headRevision`
for both `observed` and `missing` states. A mismatch returns
`REPOSITORY_BINDING_MISMATCH`.

## Closed bounds

V1 freezes these intake-specific limits:

```ts
MISSION_INTAKE_MAX_BRIEF_IDENTIFIER_LENGTH = 256
MISSION_INTAKE_MAX_OBJECTIVE_LENGTH = 512
MISSION_INTAKE_MAX_REPOSITORY_ID_LENGTH = 201
MISSION_INTAKE_MAX_BRANCH_LENGTH = 256
MISSION_INTAKE_MAX_REPOSITORY_REVISION_LENGTH = 128
MISSION_INTAKE_MAX_RUNTIME_ID_LENGTH = 256
MISSION_INTAKE_MAX_SOURCE_REF_LENGTH = 2_048
MISSION_INTAKE_MAX_ARTIFACT_PATH_LENGTH = 512
MISSION_INTAKE_MAX_RECOMMENDATION_REASON_LENGTH = 2_048
MISSION_INTAKE_MAX_PARTICIPANTS = SUPPORTED_SEAT_IDS.length
MISSION_INTAKE_MAX_MODE_RECOMMENDATIONS = 16
MISSION_INTAKE_MAX_RUNTIME_OBSERVATIONS = 16
MISSION_INTAKE_MAX_EVIDENCE_REFS_PER_OBSERVATION = 16
MISSION_INTAKE_MAX_TOTAL_EVIDENCE_REFS = 64
```

Mission ID, issue/subject ID, issue revision ID, created brief revision ID, and
participant seat IDs use the existing brief identifier grammar
`^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$`. Participant IDs must additionally be
members of `SUPPORTED_SEAT_IDS`; the participant array is unique, non-empty,
and cannot exceed that closed set's length.

Repository ID uses the existing configuration grammar: two slash-separated
owner/name segments, each between 1 and 100 characters and matching
`[A-Za-z0-9][A-Za-z0-9._-]*`. Repository observation ID must equal validated
configuration repository ID when configuration was supplied.

Branch, repository revision, and runtime ID use their separate limits above,
must be non-empty, and reject control characters. Source and evidence
references use the source-ref limit.

An artifact path is valid only when it is non-empty and at most 512 characters,
does not begin with `/`, and contains no backslash, percent sign, ASCII control
character, empty path segment, `.` segment, or `..` segment. These are the exact
rules used by the intake contract; v1 does not rely on an unnamed private
validator.

Arrays must be dense, plain arrays with no extra properties. Values outside
these limits return the reason code for their containing field.

## Reused package behavior

After descriptor-safe normalization, the implementation calls:

1. `validateShieldConfig(request.configObservation.config)` when configuration
   was supplied;
2. `createSupervisedMissionBrief(...)` with:
   - validated participant identifiers;
   - `activatedModes: []`;
3. `validateSupervisedMissionBrief(...)` on the created value;
4. `classifyMissionRisk(...)` on the structurally validated brief risk flags;
5. `createEvidenceRequirements(...)` on the validated brief.

It must not duplicate those functions' schema, canonicalization, digest,
closed-risk, or evidence-requirement semantics.

## Recommendation handling

`recommendedModes` is a separate, non-authoritative intake projection. Each
recommendation binds:

```ts
{
  modeId: "delivery" | "debugger";
  seatId: string;
  reason: string;
  source: "human_requested" | "hill_recommended";
}
```

Every mode must be supported by the validated repository configuration and
every seat must be a supported mission participant. Recommendations never
populate `brief.activatedModes`.

Until a later approved mode-activation contract exists, the result reports:

```text
modeActivationState: "unsupported_after_approval"
```

This is a framework gap, not permission to activate modes through prose.

## Seat and gate projection

The immutable brief remains compatible with the existing participant schema.
The intake result derives:

- `dispatchable_seat` for configured non-human participants;
- `human_gate` for Coulson, Fitz, and conditional Simmons.

This projection is advisory compatibility behavior. It must include:

```text
seatGateEnforcement: "derived_not_schema_enforced"
```

Issue #124 remains the owner of structural seat/gate enforcement.

## Runtime observations

V1 accepts bounded observations such as:

```ts
{
  seatId: "may" | "daisy";
  status: "human_reported_unverified" | "host_probed";
  observedAt: string;
  runtimeId: string | null;
  evidenceRefs: string[];
}
```

No observation can authorize dispatch or become a runtime binding. Historical
human reports remain unverified.

## Closed result

### Candidate

```ts
{
  state: "candidate";
  schemaVersion: 1;
  contractVersion: "mission.intake.v1";
  authority: "non_authoritative";
  persistence: "not_persisted";
  repositoryObservation: RepositoryObservationV1;
  issueObservation: IssueObservationV1;
  configObservation: ConfigObservationV1;
  brief: SupervisedMissionBrief;
  risk: RiskAssessment;
  requirements: EvidenceRequirement[];
  recommendedModes: RecommendedModeV1[];
  modeActivationState: "unsupported_after_approval";
  participants: ParticipantKindV1[];
  seatGateEnforcement: "derived_not_schema_enforced";
  artifacts: MissionIntakeArtifactRefsV1;
  communication: {
    missionFile: "file_backed_unverified";
    journal: "journal_not_initialized";
    missionWorkspace: "mission_workspace_not_created";
    external: "communication_not_configured";
  };
  runtimeObservations: RuntimeObservationV1[];
  blockers: MissionIntakeBlockerV1[];
  pendingHumanGates: HumanGatePreviewV1[];
  nextAction: "provision_repository" | "initialize_journal";
}
```

### Blocked

```ts
{
  state: "blocked";
  schemaVersion: 1;
  contractVersion: "mission.intake.v1";
  authority: "none";
  persistence: "not_persisted";
  reasonCodes: MissionIntakeReasonCodeV1[];
  nextAction: "repair_intake" | "provision_repository";
}
```

## Reason codes

The first closed set:

- `INVALID_REQUEST`
- `INVALID_CONFIG`
- `REPOSITORY_CONFIG_NOT_OBSERVED`
- `REPOSITORY_BINDING_MISMATCH`
- `INVALID_REPOSITORY_OBSERVATION`
- `INVALID_ISSUE_OBSERVATION`
- `INVALID_BRIEF_INPUT`
- `UNSUPPORTED_PARTICIPANT`
- `HUMAN_GATE_MISSING`
- `SIMMONS_PARTICIPATION_MISMATCH`
- `INVALID_MODE_RECOMMENDATION`
- `INVALID_ARTIFACT_REFERENCE`
- `INVALID_RUNTIME_OBSERVATION`
- `BRIEF_CONSTRUCTION_FAILED`

Validation returns reason codes and bounded field paths, not host secrets or raw
exception text.

## Persistence boundary

V1 is pure and returns either `candidate` or `blocked`. It does not initialize
the journal.

Repository-observed valid configuration produces no configuration blocker. An
explicitly labelled bootstrap configuration may produce a candidate, but the
candidate retains `provided_not_repository_observed`, includes
`REPOSITORY_CONFIG_NOT_OBSERVED`, and returns
`nextAction: "provision_repository"`. Missing configuration returns a blocked
result with the same next action. A bootstrap value never masquerades as
repository configuration.

A later host orchestration step may:

1. load and validate the trusted binding registry;
2. call `validateRepositoryBindings(...)`;
3. call `createMissionBegunEntry(...)`;
4. call `initializeSupervisedMissionJournal(...)`;
5. call `readSupervisedMissionJournal(...)`;
6. exact-match the readback projection to the candidate brief.

Keeping persistence outside v1 prevents a partially failed intake from
claiming authority or durable mission state.

`pendingHumanGates` is only a preview before this readback. `await_coulson` may
become an authoritative runtime action only after a verified journal replay
establishes that requirement.

## CLI

Do not add a CLI command in the first patch. Prove the package function and
packed consumer first. A CLI is a host adapter and should be added only after
the Issue #130 self-intake demonstrates the stable request shape.

## Test obligations

Focused tests must prove:

- valid Issue #130-shaped request returns a deterministic candidate;
- equivalent plain-data input returns the same brief revision;
- unknown, inherited, accessor-backed, sparse, duplicate, or malformed input
  fails closed;
- incomplete or unknown risk flags fail closed through existing policy;
- repository observation/config mismatch fails closed;
- stale repository configuration revision returns
  `REPOSITORY_BINDING_MISMATCH`;
- repository, issue, configuration, and artifact provenance is retained;
- issue observation requires `observedAt`;
- brief subject exactly matches the observed issue identifier;
- every artifact reference is bound to the observed repository HEAD;
- bootstrap configuration remains visibly non-repository-observed and creates
  a provisioning blocker;
- missing repository configuration blocks with `provision_repository`;
- unsupported or non-participant mode recommendation fails closed;
- recommended modes never become activated modes;
- Coulson/Fitz/conditional Simmons are returned as human gates;
- missing required human gates fails closed;
- historical May/Daisy health remains `human_reported_unverified`;
- no model, tool, filesystem, GitHub, runner, Helicarrier, permission, adapter,
  or journal effect is reachable;
- every bounded string and collection rejects its exact limit plus one;
- brief identifiers and objective accept their existing effective package
  maximums and reject maximum plus one;
- participant count cannot exceed `SUPPORTED_SEAT_IDS.length`;
- artifact paths reject absolute, backslash, percent, control, empty, `.`, and
  `..` forms;
- package surface and strict external TypeScript consumer expose the function
  and declarations.

## Dogfood invocation

After implementation, invoke the packed public function with an exact
Issue #130 input fixture bound to:

- repository base `68defc3fed912dda663d00438ce68c249fe39d5c`;
- the exact implementation HEAD supplied by the host at run time;
- Issue #130's host-observed revision/source reference;
- complete risk flags with `hillHighRisk: true`;
- participants Hill, Daisy, Fury, May, Coulson, and Fitz;
- Delivery Mode recommended for Hill but not activated;
- the Mission Brief, mission communication file, and shared runtime
  instruction references;
- May and Daisy historical health marked `human_reported_unverified`.

Expected result:

- `candidate`;
- explicit approval required;
- configuration provenance
  `provided_not_repository_observed`;
- blocker `REPOSITORY_CONFIG_NOT_OBSERVED`;
- non-authoritative human-gate preview;
- `nextAction: "provision_repository"`;
- no journal, dispatch, execution, or publication claim.

Mack validation remains an independent validation capability outside the v1
participant fixture. Making Mack a configured, dispatchable mission seat is a
separate unresolved human decision.

## Relationship to Issue #130 completion

This slice is milestone one, not the canonical mission runtime promised by
Issue #130. Successful dogfooding proves only that executable package behavior
participated in intake and produced an evidence-bound starting packet.

A later milestone must still compose durable journal initialization/readback,
derive the next authoritative action, dispatch the eligible seat, authorize
effects, append results, and stop at a human gate. Until that exists,
`dispatchFury()` and its await boundary remain host/bootstrap behavior rather
than S.H.I.E.L.D. package runtime enforcement.

## Stop conditions

Return to Coulson if implementation requires:

- changing the existing Mission Brief schema;
- adding mode authority through recommendation;
- creating a new journal version;
- weakening trusted binding requirements;
- dispatching a runtime;
- invoking tools or external communication;
- adding server, scheduler, GUI, or general mission-loop behavior;
- reorganizing unrelated runtime modules.
