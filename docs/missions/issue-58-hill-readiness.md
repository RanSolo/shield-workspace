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

### Candidate identity and attribution

The closed candidate binds:

- schema and rubric version;
- mission ID;
- artifact ID and type;
- immutable artifact-owning seat ID;
- exact artifact revision;
- Hill as the assessing seat;
- reasoning-runtime and tool-executor IDs, each independently nullable only
  when not observable;
- completed refinement passes, restricted to `0` or `1`;
- exactly one assessment for every dimension in canonical order.

Seats, reasoning runtimes, and tool executors remain distinct. A runtime or
executor cannot be substituted for a seat, and model branding cannot occupy a
human seat.

### Exact freshness

The host supplies a separate closed observation containing the current artifact
revision. Exact inequality between the candidate revision and that observation
returns `BLOCKED_ESCALATE` with `ARTIFACT_REVISION_STALE`. Missing, malformed,
or ambiguous freshness evidence fails closed. The evaluator does not discover
the current revision itself.

### Closed dimensions

Every candidate contains these dimensions exactly once and in this order:

1. `scope_completeness`
2. `authority_safety`
3. `contract_consistency`
4. `implementation_boundedness`
5. `validation_readiness`
6. `operational_completeness`
7. `ownership_continuity`
8. `escalation_fitness`

Each assessment uses exactly one closed status:

- `satisfied`
- `refinement_required`
- `escalation_required`
- `not_applicable`

`not_applicable` is permitted only for `operational_completeness` and requires
bounded evidence establishing why. Callers supply statuses and opaque evidence
references; they cannot supply outcomes, next owners, reason codes, timestamps,
Fury findings, or free-form private reasoning.

### Deterministic outcome precedence

1. Invalid structure returns invalid `BLOCKED_ESCALATE` evidence and never
   `GOOD_ENOUGH`.
2. A stale revision returns `BLOCKED_ESCALATE`.
3. Any `escalation_required` dimension returns `BLOCKED_ESCALATE`.
4. Any `refinement_required` dimension with zero completed passes returns
   `NEEDS_REFINEMENT`.
5. A required refinement after one completed pass returns `BLOCKED_ESCALATE`
   with `REFINEMENT_LIMIT_REACHED`.
6. Otherwise the result is `GOOD_ENOUGH`.

Reason codes and requested-refinement entries are derived by the evaluator in
canonical dimension order. A `NEEDS_REFINEMENT` result sets its next owner to
the artifact's existing owning seat. The caller cannot select or change that
owner. Other outcomes do not perform routing.

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
- [ ] Escalation takes precedence over refinement.
- [ ] One refinement returns only to the immutable artifact-owning seat.
- [ ] A second required refinement escalates rather than recursing.
- [ ] Seat, reasoning-runtime, and tool-executor attribution remain distinct.
- [ ] Callers cannot inject an outcome, reason, next owner, Fury finding, or
      authority claim.
- [ ] Output and nested data are immutable and repeatable for identical input.
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
evidence, or change any excluded subsystem.
