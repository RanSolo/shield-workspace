# Issue #251 Helicarrier V0 Slice 4 plan

## Exact mission binding

- Mission: `mission:issue-251-slice-4`
- Mission revision: `sha256:2R4EAI4KEyP-4KDDK8PEtR-7CdQjLVOzEtjTVLDFzME`
- Repository: `RanSolo/shield-workspace`
- Branch: `agent/issue-251-helicarrier-v0-slice-4`
- Exact base: `6cff71e599a968e5a8395795845e5fc20bc90ac9`
- Subject: `github:RanSolo/shield-workspace/issue/251`

## Objective

Add one companion review-checkpoint projection after the merged Feature Flight
execute-once step. The boundary consumes exact successful Slice 3 evidence,
independently replayed production Mack validation evidence, and the current
exact-head Fury/human-review projection. Existing Mack and review ledgers remain
the durable sources; Slice 4 emits one canonical, non-authoritative projection
and operator handoff identifying the next real gate. It never fabricates a
verdict, treats absence as approval, dispatches a seat, advances Feature Flight
state, or passes a human gate automatically.

## Baseline poll

At exact base, Daisy, Mack, and Fury were asked blind:

> What currently forces Hill or your seat to reconstruct context or make manual
> transition decisions before determining the correct review/human-gate stop?
> What is the smallest machine-readable input and output that would remove that
> work without changing seat authority?

These responses are Hill-supplied external validation context, not controller
evidence or acceptance. The shared baseline is:

- Feature Flight currently collapses every completed/review state into
  `authority-verification-required`.
- Hill manually joins the exact terminal triad, repository HEAD, Mack evidence,
  Fury review revision, and required human seats.
- Daisy may summarize or consume the resulting stop context, but must not grant
  authority, dispatch, or reinterpret advisory output as a decision.
- Mack requires exact request/evidence reconstruction rather than a
  caller-asserted PASS.
- Fury requires append-only review revision lineage and independent exact-head
  evidence freshness.

After implementation, Hill may run the same external poll again before showing
the baseline. Any durable claim must bind actual seat/runtime receipts; absent
those receipts, the comparison remains explicitly Hill-supplied context under
#161 and does not prove acceptance.

## Scope boundary

Included:

- one closed `feature-flight-review-checkpoint` contract;
- exact binding to the successful Slice 3 terminal, successor, result, plan,
  state, effect claim, repository/common-Git identity, branch, and current HEAD;
- pure replay validation for production Mack evidence against its frozen
  request and exact implementation revision;
- replay of one separately identified canonical supervised review-revision
  journal for current-head Fury, Fitz, and conditional Simmons state;
- deterministic pending, pass, revise, blocked, stale, invalid, and recovery
  handoffs;
- an explicit `coulson_final_acceptance_required` human-only stop after all
  technical/product gates;
- hostile, stale, duplicate, conflicting, revision-reuse, and deterministic
  replay tests.

Excluded:

- changing Daisy, Mack, Fury, or human seat authority;
- generating specialist reasoning or a new specialist packet schema;
- dispatching or invoking Daisy, Mack, Fury, May, or a human;
- accepting caller-supplied PASS, review verdict, human decision, eligibility,
  or next-seat values;
- writing review or human evidence;
- changing Slice 1 plan/state/status or Slice 2/3 claim/result/terminal schemas;
- advancing `complete` back into implementation or mutating Feature Flight
  state;
- durable derived-checkpoint storage, CLI exposure, proving flights, merge,
  deployment, release, or cleanup.

## Composition decision

Slice 4 is additive. It adds `feature-flight-review-gates.mjs` after the
execute-once seam. It does not add review behavior to
`computeFeatureFlightStatus` or `runFeatureFlightStepV1`.

The caller supplies only exact artifact paths/digests and one closed binding
that distinguishes the schema-9 execution mission from the schema-8 review
mission. Trusted host dependencies independently:

1. observe the repository root, common-Git identity, branch, and HEAD;
2. read the canonical protected Mack replay registry for the frozen request;
   and
3. load and snapshot the separately identified supervised review journal.

All dependency functions and descriptors are snapshotted before the first
await. Missing, mutable, proxy/accessor-backed, extra, or identity-colliding
dependencies fail before storage or external observation.

## Requirement IDs

### S4-R1 — Exact successful-flight binding

Extract one pure read-only successful-terminal evaluator from
`feature-flight-step.mjs` and make both the existing step runner and Slice 4
use it. Replay the exact plan/state/predecessor and Slice 3 terminal set through
that evaluator. The checkpoint is admissible only for one successful v2
terminal whose successor is the exact legal `active -> complete` state and
whose result binds the selected mission, effect claim, branch, worktree, and
completion revision. Recovery, legacy-incomplete, partial, malformed,
substituted, or conflicting stores return a closed recovery handoff before
review evidence is loaded.

### S4-R2 — Fresh repository identity

Freeze two distinct revisions:

- `flightCompletionRevision`, permanently equal to the successful Slice 3
  terminal revision A; and
- `currentReviewRevision`, initially A and later B only through exact append-only
  review-subject supersession.

Independently observe canonical root, common-Git directory plus device/inode,
branch, clean status, and HEAD. Exact HEAD must equal `currentReviewRevision`;
the successful terminal remains bound to `flightCompletionRevision`. Root
alias, common-Git replacement, dirty state, branch drift,
HEAD drift, observation failure, or timestamp rollback stops before Mack/Fury
evaluation. Core code performs no Git or network mutation.

### S4-R3 — Production Mack replay

Keep production promotion private to `mack-validation-runner.mjs`. Export only
the existing structural reconstruction needed for compatibility, then add one
read-only protected-registry verifier in that runner. The verifier derives the
request path from the normalized frozen request, checks canonical registry root
confinement, owner and mode, record/request/evidence digests, production
provenance, and exact request binding, and returns an immutable trusted
readback. The controller never accepts arbitrary `(request,evidence)` objects.

Zero current-revision records means `waiting`; exactly one is evaluated;
multiple records, path aliases, wrong owner/mode, malformed records, or
conflicting request/evidence digests mean `invalid` or `recovery` according to
whether durable readback is certain. Exact mission, subject, repository,
root/common-Git, branch, base, `currentReviewRevision`, implementation paths,
and approved test surfaces must match.

The gate maps independently validated Mack evidence to:

- `waiting` when no evidence exists;
- `pass` only when production and advancement eligibility are both eligible,
  report status is pass, every required scenario/lane passes, and limitations
  and reason codes are empty;
- `revise` for product/test/coverage defects;
- `blocked` for explicit environmental or advisory limitations;
- `stale` for exact-binding mismatch; and
- `invalid` for malformed, duplicate, or conflicting evidence.

No caller status field is trusted independently from full replay.

### S4-R4 — Current-head Fury replay and revision lineage

Replay one canonical supervised schema-8 review journal through
`replaySupervisedMissionJournal`. The schema-9 `executionMissionId` and
`executionMissionRevisionId` remain bound to the Slice 3 terminal. A distinct
`reviewMissionId` and `reviewMissionRevisionId` own schema-8 Fury/Fitz/Simmons
evidence; using the same mission ID in both journals is rejected.

One frozen trusted cross-binding binds both mission identities, the exact
subject, review-journal descriptor, `flightCompletionRevision`,
`currentReviewRevision`, repository identity, branch, and source artifact
identities. Schema 8 proves only subject/revision review lineage; repository
root, common-Git identity, and branch come from the trusted descriptor and host
observation and are never inferred from schema-8 fields. Fury state comes only
from the replayed current-head Fury record:

- no record -> `waiting`;
- `changes_requested` -> `revise`;
- `approved` -> `pass`;
- prior-revision record -> `stale`;
- duplicate/conflicting/malformed record -> `invalid`.

Review supersession is append-only A -> B. B becomes
`currentReviewRevision`, must equal live HEAD, and invalidates all Mack, Fury,
Fitz, and Simmons states so precedence restarts at Mack. A -> B -> A reuse, broken
supersession, more than one current revision, or evidence attached to a stale
revision fails closed. Slice 4 never rewrites Feature Flight state to represent
review repair.

### S4-R5 — Human-only stops

Fitz and conditional Simmons requirements and evidence come only from the same
validated current review-subject projection. Missing evidence produces an
explicit human-only stop; current signed evidence may be reported as
`satisfied`, while rejected, stale, conflicting, or malformed evidence stops.

Coulson final acceptance is always the last `waiting` human-only stop in this
slice, named exactly `coulson_final_acceptance_required`. This fixed Slice 4
terminal policy follows the universal mission-profile rule but does not claim
the controller replayed or satisfied a profile-aware final-acceptance record.
It is not GitHub technical review. A later separately reviewed exact-HEAD
contract may close that bridge. No output from this slice authorizes merge,
deployment, or release.

### S4-R6 — Deterministic precedence

The closed stop precedence is:

1. malformed/recovery/incomplete flight evidence;
2. repository freshness or identity failure;
3. review revision-lineage failure;
4. Mack invalid/stale/waiting/blocked/revise;
5. Fury invalid/stale/waiting/revise;
6. Fitz invalid/stale/waiting/rejected;
7. conditional Simmons invalid/stale/waiting/rejected;
8. Coulson final acceptance waiting.

Every terminal row maps exhaustively to:

```text
phase
stopCode
gateSeatId | null
correctionSeatId | null
investigationSuggestionSeatId | null
nextAction
```

Mack waiting names Mack as gate seat; Mack product failure names May as
correction seat; test/coverage failure names Mack; environmental/advisory block
has no correction seat and may suggest Daisy investigation. Fury waiting names
Fury as gate seat and Fury revise names May as correction seat. Human waiting
names only the corresponding human gate. Invalid, stale, and recovery states
name no synthetic approver and select a closed inspect/recover action. Daisy is
never the accountable review gate.

Every projection remains `authority:"none"`, `gateEligible:false`, and carries
requirement/evidence references only when derived from validated records.

### S4-R7 — Canonical read-only projection and handoff

Canonicalize one deterministic checkpoint value from the exact source bytes.
It includes source artifact identities, both mission identities, completion and
current review revisions, evaluated review-journal sequence, Mack/Fury/human
projections, stop reason, gate/correction/investigation seats, and one exact safe
next-action enum. It contains no observation-time field, free-form authority
claim, write path, or caller-selected current pointer. Identical source bytes
produce identical bytes and digest.

Slice 4 returns this value and digest only. Existing Mack/review ledgers remain
the durable evidence. Durable derived storage is deferred until a separate plan
defines host-owned roots, current-head semantics, concurrency, and stale replay.

### S4-R8 — Daisy boundary and poll proof

The handoff may route a later evidence-gap investigation to Daisy only when the
validated Mack classification is environmental/advisory and the closed mapping
selects Daisy. It does not construct Daisy reasoning, grant a Daisy dispatch,
or alter Daisy's existing Runner packet/result contract.

The controller performs no poll or seat invocation. After exact-head Mack/Fury
validation, Hill may externally ask Daisy, Mack, and Fury the identical baseline
question blind. Record whether manual identity joins, stop selection, or context
reconstruction remain and bind any durable claim to actual seat/runtime receipts.
The poll is observational evidence only and is not a controller acceptance gate.

## Planned files

- `docs/missions/issue-251-helicarrier-v0-slice-4-plan.md`
- `docs/operations/feature-flight-review-gates.md`
- `docs/operations/persisted-artifact-contract-matrix.md`
- `packages/shield-team-system/README.md`
- `packages/shield-team-system/docs/operations/feature-flight-review-gates.md`
- `packages/shield-team-system/docs/operations/persisted-artifact-contract-matrix.md`
- `packages/shield-team-system/src/mack-local-validation-v1.mts`
- `packages/shield-team-system/scripts/model/mack-validation-runner.mjs`
- `packages/shield-team-system/scripts/operations/feature-flight-review-gates.mjs`
- `packages/shield-team-system/scripts/operations/feature-flight-step.mjs`
- `packages/shield-team-system/tests/mack-local-validation-v1.test.mjs`
- `packages/shield-team-system/tests/mack-validation-runner.test.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-review-gates.test.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-step.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`

No other tracked path is writable without a new mission revision and Fury plan
review.

## Validation

- focused Mack evidence replay tests;
- focused Feature Flight review-gate tests;
- all prior Slice 1-3 controller/step/recovery tests;
- full `@shield/team-system` suite with stable environment variables;
- Nx affected tests and builds, with environmental blocks reported separately;
- package surface, mirrored-document equality, and `git diff --check`;
- exact-head Mack validation followed by Fury conformance review;
- optional external blind post-implementation Daisy/Mack/Fury poll.

## Stop

After Mack and Fury pass, request bounded review-publication authority, open one
draft PR, and stop for Coulson's operator review. The controller's own terminal
order remains Fury -> Fitz -> conditional Simmons -> Coulson final acceptance;
PR publication is a separate authorized external workflow. Do not mark ready,
merge, deploy, release, run a proving flight, or enter another issue.
