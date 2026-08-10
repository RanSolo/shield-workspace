# Issue #251 Helicarrier V0 Slice 4 plan

## Exact mission binding

- Mission: `mission:issue-251-slice-4`
- Mission revision: `sha256:2R4EAI4KEyP-4KDDK8PEtR-7CdQjLVOzEtjTVLDFzME`
- Repository: `RanSolo/shield-workspace`
- Branch: `agent/issue-251-helicarrier-v0-slice-4`
- Exact base: `6cff71e599a968e5a8395795845e5fc20bc90ac9`
- Subject: `github:RanSolo/shield-workspace/issue/251`

## Objective

Add one companion review-checkpoint boundary after the merged Feature Flight
execute-once step. The boundary consumes exact successful Slice 3 evidence,
independently replayed Mack validation evidence, and the current exact-head
Fury/human-review projection. It writes one immutable, content-addressed,
non-authoritative checkpoint and operator handoff identifying the next real
gate. It never fabricates a verdict, treats absence as approval, dispatches a
seat, advances Feature Flight state, or passes a human gate automatically.

## Baseline poll

At exact base, Daisy, Mack, and Fury were asked blind:

> What currently forces Hill or your seat to reconstruct context or make manual
> transition decisions before determining the correct review/human-gate stop?
> What is the smallest machine-readable input and output that would remove that
> work without changing seat authority?

The shared baseline is:

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

After implementation, the same question is asked again before showing the
baseline. The before/after comparison is evidence for #161 and does not itself
prove acceptance.

## Scope boundary

Included:

- one closed `feature-flight-review-checkpoint` contract;
- one immutable content-addressed checkpoint store outside every repository and
  worktree root;
- exact binding to the successful Slice 3 terminal, successor, result, plan,
  state, effect claim, repository/common-Git identity, branch, and current HEAD;
- pure replay validation for production Mack evidence against its frozen
  request and exact implementation revision;
- replay of the canonical supervised review-revision journal for current-head
  Fury, Fitz, and conditional Simmons state;
- deterministic pending, pass, revise, blocked, stale, invalid, and recovery
  handoffs;
- an explicit final Coulson human-only stop after all technical/product gates;
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
- CLI exposure, proving flights, merge, deployment, release, or cleanup.

## Composition decision

Slice 4 is additive. It adds `feature-flight-review-gates.mjs` after the
execute-once seam. It does not add review behavior to
`computeFeatureFlightStatus` or `runFeatureFlightStepV1`.

The caller supplies only exact artifact paths/digests, one mission route, and
the expected checkpoint-store root. Trusted host dependencies independently:

1. observe the repository root, common-Git identity, branch, and HEAD;
2. load and snapshot the Mack request plus production evidence;
3. load and snapshot the supervised review journal; and
4. provide create-only checkpoint storage.

All dependency functions and descriptors are snapshotted before the first
await. Missing, mutable, proxy/accessor-backed, extra, or identity-colliding
dependencies fail before storage or external observation.

## Requirement IDs

### S4-R1 — Exact successful-flight binding

Replay the exact plan/state/predecessor and Slice 3 terminal set using the
existing validators. The checkpoint is admissible only for one successful v2
terminal whose successor is the exact legal `active -> complete` state and
whose result binds the selected mission, effect claim, branch, worktree, and
completion revision. Recovery, legacy-incomplete, partial, malformed,
substituted, or conflicting stores return a closed recovery handoff before
review evidence is loaded.

### S4-R2 — Fresh repository identity

Independently observe canonical root, common-Git directory plus device/inode,
branch, clean status, and HEAD. Exact HEAD must equal the completion revision
under review. Root alias, common-Git replacement, dirty state, branch drift,
HEAD drift, observation failure, or timestamp rollback stops before Mack/Fury
evaluation. Core code performs no Git or network mutation.

### S4-R3 — Production Mack replay

Extract the existing private reconstruction logic into one pure exported
`validateMackProductionEvidenceV1(request, evidence)` boundary. It normalizes
the request, reconstructs the synthetic evidence from raw receipts and model
analysis, performs the existing production promotion, recomputes the digest,
and exact-compares every field. It accepts only `evidenceSource:"production"`
and requires exact mission, subject, repository, root/common-Git, branch,
base, artifact revision, implementation paths, and approved test surfaces.

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
`replaySupervisedMissionJournal`. Its current review subject must bind the exact
mission, subject, repository, branch, completion HEAD, and current checkpoint
revision. Fury state comes only from the replayed current-head Fury record:

- no record -> `waiting`;
- `changes_requested` -> `revise`;
- `approved` -> `pass`;
- prior-revision record -> `stale`;
- duplicate/conflicting/malformed record -> `invalid`.

Review supersession is append-only A -> B. A -> B -> A reuse, broken
supersession, more than one current revision, or evidence attached to a stale
revision fails closed. Slice 4 never rewrites Feature Flight state to represent
review repair.

### S4-R5 — Human-only stops

Fitz and conditional Simmons requirements and evidence come only from the same
validated current review-subject projection. Missing evidence produces an
explicit human-only stop; current signed evidence may be reported as
`satisfied`, while rejected, stale, conflicting, or malformed evidence stops.

Coulson final acceptance is always the last `waiting` human-only stop in this
slice. Slice 4 neither consumes nor records final acceptance because the
existing profile-aware acceptance record is mission-revision-bound rather than
an independently reviewed exact Feature Flight HEAD. A later separately
reviewed contract may close that bridge. No output from this slice authorizes
merge, deployment, or release.

### S4-R6 — Deterministic precedence

The closed stop precedence is:

1. malformed/recovery/incomplete flight evidence;
2. repository freshness or identity failure;
3. review revision-lineage failure;
4. Mack invalid/stale/waiting/blocked/revise;
5. Fury invalid/stale/waiting/revise;
6. Fitz waiting/rejected;
7. conditional Simmons waiting/rejected;
8. Coulson final acceptance waiting.

Every projection remains `authority:"none"`, `gateEligible:false`, and carries
one exact accountable seat plus requirement/evidence references only when
derived from validated records.

### S4-R7 — Immutable checkpoint and handoff

Canonicalize one checkpoint value, derive its digest and checkpoint ID, and
create exactly one mode-0600 file beneath a mode-0700 external store using
write-all, file sync, close, parent sync, and exact readback. Identical input
replays the same bytes. Different evidence heads create new immutable
checkpoints. Existing malformed, symlinked, aliased, wrong-mode, substituted,
or conflicting paths remain untouched and return `recovery_required`.

The checkpoint includes source artifact identities, evaluated journal sequence,
Mack/Fury/human projections, stop reason, accountable seat, exact safe next
action, and no free-form authority claim.

### S4-R8 — Daisy boundary and poll proof

The handoff may route a later evidence-gap investigation to Daisy only when the
validated Mack classification is environmental/advisory and the closed mapping
selects Daisy. It does not construct Daisy reasoning, grant a Daisy dispatch,
or alter Daisy's existing Runner packet/result contract.

After exact-head Mack/Fury validation, ask Daisy, Mack, and Fury the identical
baseline question blind. Record whether manual identity joins, stop selection,
or context reconstruction remain. This poll is observational evidence only.

## Planned files

- `docs/missions/issue-251-helicarrier-v0-slice-4-plan.md`
- `docs/operations/feature-flight-review-gates.md`
- `docs/operations/persisted-artifact-contract-matrix.md`
- `packages/shield-team-system/README.md`
- `packages/shield-team-system/docs/operations/feature-flight-review-gates.md`
- `packages/shield-team-system/docs/operations/persisted-artifact-contract-matrix.md`
- `packages/shield-team-system/src/mack-local-validation-v1.mts`
- `packages/shield-team-system/scripts/operations/feature-flight-review-gates.mjs`
- `packages/shield-team-system/scripts/operations/feature-flight-review-gate-store.mjs`
- `packages/shield-team-system/tests/mack-local-validation-v1.test.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-review-gates.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`

No other tracked path is writable without a new mission revision and Fury plan
review.

## Validation

- focused Mack evidence replay tests;
- focused Feature Flight review-gate/store tests;
- all prior Slice 1-3 controller/step/recovery tests;
- full `@shield/team-system` suite with stable environment variables;
- Nx affected tests and builds, with environmental blocks reported separately;
- package surface, mirrored-document equality, and `git diff --check`;
- exact-head Mack validation followed by Fury conformance review;
- blind post-implementation Daisy/Mack/Fury poll.

## Stop

After Mack and Fury pass, request bounded review-publication authority, open one
draft PR, and stop for Coulson's GitHub review. Do not mark ready, merge, deploy,
release, run a proving flight, or enter another issue.
