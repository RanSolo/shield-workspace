# Hill operational readiness v1

`hill.readiness.v1` is a pure advisory classifier for observable readiness
evidence attached to one exact seat-owned artifact revision. Its only public
entry point is `@shield/team-system/hill-readiness`.

The contract does not grant authority, route work, dispatch specialists,
change mission state, append a journal, authenticate host observations, or
replace Fury review. A `GOOD_ENOUGH` result means only that the supplied closed
evidence record satisfies this rubric.

## Inputs and trust boundary

The candidate contains exactly:

```text
readinessContractVersion, missionId, subjectId, revisionId, artifactKind,
owningSeatId, dimensions
```

The host observation contains exactly:

```text
observationContractVersion, assuranceKind, missionId, subjectId,
currentRevisionId, artifactKind, owningSeatId, journalSchemaVersion, evaluatedThroughSequence,
journalHeadEntryId, refinementPassesCompleted, reasoningRuntimeId,
toolExecutorId
```

`assuranceKind` is always `host_asserted_non_authoritative`. The evaluator
validates and preserves the asserted replay position, attribution, current
revision, and refinement count. It does not prove any of them. The host owns
journal replay, durable refinement history, runtime assignment, and the truth
of the current artifact revision.

Freshness requires exact candidate/observation mission, subject, artifact kind,
and owning-seat equality plus exact `revisionId`/`currentRevisionId` equality.
Mission, subject, kind, or owner mismatch produces `REPLAY_BINDING_MISMATCH`;
revision mismatch produces `ARTIFACT_REVISION_STALE`.

The evaluator derives `assessorSeatId: hill`. A caller cannot provide an
assessor. Non-null runtime and executor identifiers must not equal a S.H.I.E.L.D.
seat ID, case-insensitively. Runtime and executor values remain asserted
attribution, not seat occupancy, capability, or authority.

## Dimensions and statuses

Dimensions occur exactly once in this order:

1. `scope_completeness`
2. `authority_safety`
3. `contract_consistency`
4. `implementation_boundedness`
5. `validation_readiness`
6. `operational_completeness`
7. `ownership_continuity`
8. `escalation_fitness`

Each dimension has one of `satisfied`, `refinement_required`,
`escalation_required`, or `not_applicable`. `not_applicable` is accepted only
for `operational_completeness` and requires one of:

- `pure_value_contract`
- `documentation_only_artifact`
- `no_runtime_or_persistent_effects`

Every assessment supplies one to eight unique evidence references. References
are syntactic opaque locators. They are never resolved, fetched, authenticated,
or evaluated for sufficiency.

## Grammars and bounds

Identifiers are 1-128 ASCII bytes and match:

```text
^[A-Za-z0-9](?:[A-Za-z0-9._:/-]{0,126}[A-Za-z0-9])?$
```

Evidence references are 1-256 ASCII bytes and match:

```text
^[A-Za-z0-9][A-Za-z0-9._:/#@-]{0,255}$
```

There are at most eight references per dimension and 64 total.
`journalSchemaVersion` is a safe integer from 1 through 255;
`evaluatedThroughSequence` is a non-negative safe integer; and
`refinementPassesCompleted` is exactly zero or one.

Only ordinary own-property data objects and dense ordinary arrays are
accepted. Unknown or inherited fields, symbols, accessors, sparse arrays,
non-plain prototypes, unsupported values, and reflective failures all produce
the same generic invalid result without echoing caller data.

## Outcomes and precedence

The evaluator applies this order:

1. malformed input → `BLOCKED_ESCALATE` / `INVALID_EVIDENCE_RECORD`;
2. mission or subject mismatch → `BLOCKED_ESCALATE` /
   `REPLAY_BINDING_MISMATCH`;
3. revision mismatch → `BLOCKED_ESCALATE` / `ARTIFACT_REVISION_STALE`;
4. any escalation status → `BLOCKED_ESCALATE`;
5. refinement status with zero completed passes → `NEEDS_REFINEMENT`;
6. refinement status with one completed pass → `BLOCKED_ESCALATE` plus
   `REFINEMENT_LIMIT_REACHED`;
7. otherwise → `GOOD_ENOUGH`.

Dimension reason codes are derived by the evaluator in canonical dimension
order. Callers cannot provide outcomes, reason codes, refinement requests, or
the next owner. `NEEDS_REFINEMENT` always names the unchanged artifact owner as
`nextOwnerSeatId`; this is evidence for the surrounding workflow, not routing.

The evaluator cannot enforce the refinement count across calls. The host must
derive that count from durable workflow history. A false host assertion cannot
be repaired by this pure value contract.

## Evidence and later analysis

Results contain no clock time, usage estimate, latency, Fury finding, private
reasoning, or authoritative journal event. Hill/Fury prediction analysis is a
separate #41/#12 concern and cannot reinterpret the original result.

The Issue #34 fixture is a `retrospective_observation` with
`predictionEligible: false`. It proves only deterministic classification of a
reconstructed evidence record; it does not claim that Hill made a prospective
decision or that refinement changed Fury's effort.
