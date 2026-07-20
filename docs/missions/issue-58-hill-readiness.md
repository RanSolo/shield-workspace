# Mission Brief: Issue #58 Hill Operational Readiness Rubric

- **Canonical issue:** `RanSolo/shield-workspace#58`
- **Mission state:** Wheels Up authorized by Phil Coulson
- **Base revision:** `8877b6b0e44e73aa9025e2034795d62da06a81ba`
- **Delivery strategy:** standard sequential S.H.I.E.L.D.
- **Implementation owner:** Melinda May
- **Human authority:** Phil Coulson

## Objective

Deliver the smallest versioned, deterministic contract that lets Maria Hill
evaluate observable operational-readiness evidence for one exact seat-owned
artifact revision. The advisory result is exactly one of `GOOD_ENOUGH`,
`NEEDS_REFINEMENT`, or `BLOCKED_ESCALATE`.

The evaluator does not grant authority, dispatch a specialist, change mission
state, append authoritative journal state, publish a handoff, or replace Nick
Fury's threat and conformance reviews.

## Dependency and workflow gate

Issue #34 and PR #57 provide retrospective evidence only. Issue #58 supplies
the closed rubric and measurement contract needed by #41 and #61. It does not
implement adaptive routing. The dependency order remains:

```text
#58 -> #54 -> #41 -> #61 -> Freeze Runtime Contracts v1
```

The Runtime Contracts v1 freeze precedes runtime profiles, Mission Control,
plugins, integrations, and alternate-runtime work.

Delivery remains sequential:

1. Daisy reconnaissance.
2. May-owned implementation blueprint.
3. Fury Threat Review before implementation.
4. One May-owned implementation slice.
5. Hill integration validation.
6. Fury Conformance Review at the exact head.
7. Human Fitz technical review.
8. Coulson retains merge authority.

## Frozen contract

### Version and public boundary

The contract ID is `hill.readiness.v1`. It is exposed only through the additive
`@shield/team-system/hill-readiness` subpath. It is not added to the package
root.

The public surface contains closed constants, TypeScript declarations, and one
pure evaluator:

```text
evaluateHillReadinessV1(candidate, freshness)
```

No clock, randomness, environment, filesystem, network, Git, journal, or global
mutable state is consulted.

### Frozen wire shapes and assurance

The candidate has exactly these fields:

```text
readinessContractVersion: 1
missionId
subjectId
revisionId
artifactKind
owningSeatId
dimensions
```

It contains no assessor, runtime, executor, refinement count, outcome, reason,
next owner, timestamp, or Fury data.

The separate host observation has exactly these fields:

```text
observationContractVersion: 1
assuranceKind: host_asserted_non_authoritative
missionId
subjectId
currentRevisionId
artifactKind
owningSeatId
journalSchemaVersion
evaluatedThroughSequence
journalHeadEntryId
refinementPassesCompleted: 0 | 1
reasoningRuntimeId: string | null
toolExecutorId: string | null
```

Candidate and observation mission ID, subject ID, artifact kind, and owning
seat must match. The candidate revision must exactly equal the observation's
current revision. This binds the freshness assertion to contract version,
mission, subject, artifact type, artifact owner, revision, journal schema,
evaluated sequence, and asserted journal-head entry rather than accepting a
revision-only value replayable across artifacts or owners.

The observation remains asserted and non-authoritative. The evaluator does not
authenticate or replay the journal, prove the refinement count, verify runtime
assignment, or discover the current revision. It classifies supplied state and
binds that state into its result. Durable history and cross-call enforcement
remain outside this pure module.

The evaluator derives `assessorSeatId: hill`; callers cannot claim an assessor.
Every valid result declares `authority: non_authoritative`, evidence assurance
as reference-only, and runtime/executor assurance as
`host_asserted_non_authoritative`. It proves neither that Hill acted nor that a
referenced artifact exists. Non-null runtime and executor IDs matching any
closed seat ID (`coulson`, `hill`, `daisy`, `may`, `fury`, `fitz`, or `simmons`)
are malformed.

### Closed dimensions, statuses, and reasons

Every candidate contains these dimensions exactly once and in this order:

1. `scope_completeness`
2. `authority_safety`
3. `contract_consistency`
4. `implementation_boundedness`
5. `validation_readiness`
6. `operational_completeness`
7. `ownership_continuity`
8. `escalation_fitness`

Each assessment contains exactly `dimension`, `status`, `evidenceRefs`, and
`operationalNotApplicableRationale`. It uses exactly one status:

- `satisfied`
- `refinement_required`
- `escalation_required`
- `not_applicable`

`not_applicable` is permitted only for `operational_completeness`. It requires
at least one bounded opaque evidence reference and one closed rationale:
`pure_value_contract`, `documentation_only_artifact`, or
`no_runtime_or_persistent_effects`. The rationale is `null` for every other
dimension/status combination. References and rationales are checked for syntax
only; they are never dereferenced or verified for truth.

| Dimension | Refinement | Escalation |
| --- | --- | --- |
| `scope_completeness` | `SCOPE_INCOMPLETE` | `SCOPE_DECISION_REQUIRED` |
| `authority_safety` | `AUTHORITY_SAFETY_INCOMPLETE` | `AUTHORITY_DECISION_REQUIRED` |
| `contract_consistency` | `CONTRACT_INCONSISTENT` | `CONTRACT_DECISION_REQUIRED` |
| `implementation_boundedness` | `IMPLEMENTATION_UNBOUNDED` | `IMPLEMENTATION_SCOPE_DECISION_REQUIRED` |
| `validation_readiness` | `VALIDATION_INCOMPLETE` | `VALIDATION_DECISION_REQUIRED` |
| `operational_completeness` | `OPERATIONAL_DETAILS_INCOMPLETE` | `OPERATIONAL_ARCHITECTURE_DECISION_REQUIRED` |
| `ownership_continuity` | `OWNERSHIP_CONTINUITY_INCOMPLETE` | `OWNERSHIP_DECISION_REQUIRED` |
| `escalation_fitness` | `ESCALATION_PREPARATION_INCOMPLETE` | `ESCALATION_TARGET_DECISION_REQUIRED` |

Global semantic reasons are `ARTIFACT_REVISION_STALE`,
`REPLAY_BINDING_MISMATCH`, and `REFINEMENT_LIMIT_REACHED`. Structural, bounds,
version, and hostile-inspection failures use only `INVALID_EVIDENCE_RECORD`.

### Grammars and bounds

Mission, subject, revision, artifact-kind, owning-seat, journal-entry, runtime,
and executor identifiers use this ASCII grammar and are at most 128 UTF-8 bytes:

```text
^[A-Za-z0-9](?:[A-Za-z0-9._:/-]{0,126}[A-Za-z0-9])?$
```

Evidence references use this grammar and are 1-256 UTF-8 bytes:

```text
^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$
```

Each dimension has 1-8 unique references and the candidate has no more than 64
references total. `journalSchemaVersion` is an integer from 1 through 255;
`evaluatedThroughSequence` is a non-negative safe integer. Whitespace, control
characters, backslashes, percent encoding, query strings, coercion, and Unicode
normalization ambiguity are rejected.

### Deterministic outcome precedence

1. Invalid structure returns one generic invalid `BLOCKED_ESCALATE` value.
2. A mission, subject, artifact-kind, or owning-seat replay-binding mismatch
   returns `BLOCKED_ESCALATE`.
3. A stale revision returns `BLOCKED_ESCALATE`.
4. Any `escalation_required` dimension returns `BLOCKED_ESCALATE`.
5. Any `refinement_required` dimension with zero completed passes returns
   `NEEDS_REFINEMENT`.
6. A required refinement after one completed pass returns `BLOCKED_ESCALATE`
   with `REFINEMENT_LIMIT_REACHED`.
7. Otherwise the result is `GOOD_ENOUGH`.

Reason codes and requested-refinement entries are derived in canonical
dimension order. A `NEEDS_REFINEMENT` result sets its next owner to the
artifact's existing owning seat. The caller cannot select or change that owner.
Other outcomes do not perform routing.

Every malformed or hostile input returns the same deeply frozen value:

```text
state: invalid
readinessContractVersion: 1
outcome: BLOCKED_ESCALATE
reasonCodes: [INVALID_EVIDENCE_RECORD]
nextOwnerSeatId: null
```

It contains no field path, rejected value, partial identity, or varying
diagnostic. Valid results use one exact frozen shape containing the replay
tuple, derived Hill assessor, explicit assurance markers, ordered reasons,
derived refinement requests, and next owner where applicable.

### Evidence and analytics boundary

The result preserves the exact identity, revision, attribution, evidence
classification, outcome, reasons, and bounded refinement request. It creates no
timestamps, usage claims, latency figures, Fury verdicts, or private reasoning.

Hill/Fury comparison and prediction-accuracy analysis are separate #41/#12
records created after Fury acts. They may classify correct escalation, Hill
miss, useful refinement, unnecessary refinement, or agreement, but they cannot
change the original Hill result.

The Issue #34 fixture is labeled `retrospective_observation` and
`predictionEligible: false`. It may demonstrate how the evaluator classifies
observable omissions, but it must not invent a prospective Hill decision or
claim measured prediction accuracy.

## Hostile-input boundary

- Accept only closed own-property plain data.
- Reject inherited properties, accessors, symbols, sparse arrays, non-plain
  prototypes, throwing proxies, duplicate or reordered dimensions, unknown
  fields, unsupported versions, control characters, and excessive values.
- Bound identifiers, revisions, evidence references, array counts, and total
  evidence.
- Never invoke caller coercion hooks or echo hostile values in errors.
- Catch every reflective or proxy inspection failure and return the generic
  invalid result rather than throwing.
- Return immutable normalized output.
- Missing, malformed, ambiguous, or hostile evidence never produces
  `GOOD_ENOUGH`.

## Expected implementation surface

- `contracts/hill-readiness-v1.mjs`
- `public/hill-readiness.mjs`
- `public/hill-readiness.d.mts`
- one focused contract test and one durable #34 retrospective fixture
- package-subpath and package-surface updates
- `docs/specifications/hill-readiness-v1.md`
- bounded public API documentation

No mission-policy, mission-record, Mission Journal, runner, permission,
delegation, broker, GitHub adapter, Mission Workspace, runtime-profile, or
Mission Control change is expected. Requiring one stops implementation and
returns the mission to Coulson.

## Acceptance criteria

- [ ] The evaluator is pure, deterministic, advisory, and versioned.
- [ ] The three outcomes and eight dimensions are closed and exact.
- [ ] Missing, malformed, stale, ambiguous, hostile, or unsupported input fails
      closed and never produces `GOOD_ENOUGH`.
- [ ] Exact revision freshness is supplied explicitly and cannot be inferred.
- [ ] The observation is replay-bound to mission, subject, revision, and its
      asserted journal position while remaining explicitly non-authoritative.
- [ ] Escalation takes precedence over refinement.
- [ ] One refinement returns only to the immutable artifact-owning seat.
- [ ] A second required refinement escalates rather than recursing.
- [ ] Seat, reasoning-runtime, and tool-executor attribution remain distinct.
- [ ] Hill identity is derived and runtime/executor assertions cannot use seat
      IDs.
- [ ] Callers cannot inject an outcome, reason, next owner, Fury finding, or
      authority claim.
- [ ] Output and nested data are immutable and repeatable for identical input.
- [ ] Malformed inputs return one generic non-echoing invalid result and never
      throw.
- [ ] #34 is a truthful retrospective, prediction-ineligible fixture.
- [ ] Focused tests cover every outcome, each refinement reason, escalation
      precedence, staleness, hostile shapes, bounds, attribution, and package
      loading.
- [ ] Package tests, workspace tests, packed strict-consumer validation, package
      dry run, and `git diff --check` pass.

## Explicit non-goals

- authority, permission, dispatch, mission-state, or journal changes;
- automated routing or recursive refinement;
- Hill-authored changes to another seat's artifact;
- Fury threat/conformance logic or Hill/Fury scoring;
- Mission Workspace publication mechanics or Mission Control;
- runtime profiles, runtime substitution, or provider-specific seat semantics;
- merge, deployment, release, or production effects.

## Authorization and stop conditions

Phil Coulson authorized the Mission Brief commit, verified draft Mission
Workspace, sequential implementation, one bounded May correction, Fury reviews,
and Fitz technical review. Merge, deployment, release, and production effects
remain unauthorized.

Implementation stops if the slice would grant authority, mutate authoritative
state, transfer artifact ownership, exceed one refinement, depend on ambient
freshness, mix Fury findings into Hill's decision, misrepresent retrospective
evidence, require journal replay or signed receipts inside the evaluator, or
change any excluded subsystem.
