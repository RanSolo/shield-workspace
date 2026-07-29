# Mission #130 — `missionIntake v1` Implementation Plan

## Status

Proposed exact implementation plan. Awaiting Fury architecture review. This
artifact authorizes no implementation by itself.

## Public position

Add one supported package entry point:

```text
@shield/team-system/intake
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
  config: unknown;
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
    missionBriefPath: string;
    missionCommunicationPath: string;
    sharedRuntimeInstructionsPath: string;
  };
  runtimeObservations: unknown;
}
```

The request is a closed plain-data object. Unknown, inherited, accessor-backed,
duplicate, malformed, or oversized fields fail closed. V1 accepts no callback,
filesystem path root, executable, model client, tool implementation, adapter,
or persistence function.

## Reused package behavior

The implementation calls:

1. `validateShieldConfig(request.config)`;
2. `classifyMissionRisk(request.proposedBrief.riskFlags)`;
3. `createSupervisedMissionBrief(...)` with:
   - validated participant identifiers;
   - `activatedModes: []`;
4. `validateSupervisedMissionBrief(...)` on the created value;
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
  nextAction: "await_coulson" | "initialize_journal";
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
  nextAction: "repair_intake";
}
```

## Reason codes

The first closed set:

- `INVALID_REQUEST`
- `INVALID_CONFIG`
- `REPOSITORY_BINDING_MISMATCH`
- `INVALID_REPOSITORY_OBSERVATION`
- `INVALID_ISSUE_OBSERVATION`
- `INVALID_BRIEF_INPUT`
- `INVALID_RISK_FLAGS`
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

V1 is pure and returns `candidate` only. It does not initialize the journal.

A later host orchestration step may:

1. load and validate the trusted binding registry;
2. call `validateRepositoryBindings(...)`;
3. call `createMissionBegunEntry(...)`;
4. call `initializeSupervisedMissionJournal(...)`;
5. call `readSupervisedMissionJournal(...)`;
6. exact-match the readback projection to the candidate brief.

Keeping persistence outside v1 prevents a partially failed intake from
claiming authority or durable mission state.

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
- unsupported or non-participant mode recommendation fails closed;
- recommended modes never become activated modes;
- Coulson/Fitz/conditional Simmons are returned as human gates;
- missing required human gates fails closed;
- historical May/Daisy health remains `human_reported_unverified`;
- no model, tool, filesystem, GitHub, runner, Helicarrier, permission, adapter,
  or journal effect is reachable;
- package surface and strict external TypeScript consumer expose the function
  and declarations.

## Dogfood invocation

After implementation, invoke the packed public function with an exact
Issue #130 input fixture bound to:

- repository base `68defc3fed912dda663d00438ce68c249fe39d5c`;
- the exact implementation HEAD supplied by the host at run time;
- Issue #130's host-observed revision/source reference;
- complete risk flags with `hillHighRisk: true`;
- participants Hill, Daisy, Fury, May, Mack, Coulson, and Fitz;
- Delivery Mode recommended for Hill but not activated;
- the Mission Brief, mission communication file, and shared runtime
  instruction references;
- May and Daisy historical health marked `human_reported_unverified`.

Expected result:

- `candidate`;
- explicit approval required;
- `nextAction: "await_coulson"`;
- no journal, dispatch, execution, or publication claim.

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
