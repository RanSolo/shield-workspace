# Issue #251 Helicarrier V0 Slice 3 plan

## Exact mission binding

- Mission: `mission:issue-251-slice-3`
- Mission revision: `sha256:W6W5LsVmgbTsw8ZHBLPTiT_4SKvie-qS-SfJPFL_5qo`
- Repository: `RanSolo/shield-workspace`
- Branch: `agent/issue-251-helicarrier-v0-slice-3`
- Exact base: `ae10c02867fcf6868d28d820a0b09904751805be`
- Subject: `github:RanSolo/shield-workspace/issue/251`

## Objective

Extend the merged one-cycle Feature Flight step with deterministic interruption
and retry recovery plus concurrent remote-branch drift detection. Preserve the
existing execute-once claim: after the claim boundary, no retry may invoke the
adapter again. The slice may observe remote state through a narrow trusted
capability, but it may not fetch into the repository, push, force-push, rewrite,
merge, or reconcile history.

## Scope boundary

Included:

- one closed, versioned remote-observation contract;
- pre-claim and post-adapter observations of the selected mission branch;
- durable recovery receipts for incomplete or drifted claimed steps;
- deterministic replay of either a successful terminal triad or a terminal
  recovery receipt without adapter reinvocation;
- concise machine-readable and operator-readable next action;
- hostile artifact, interruption, retry, and remote-drift tests.

Excluded:

- automatic claim takeover, lease expiry, or adapter retry after any durable
  claim;
- `git fetch`, ref mutation, push, force-push, merge, reset, rebase, or automatic
  divergence reconciliation;
- review-gate, Mack/Fury, or human-gate composition;
- Feature Flight CLI exposure or an unbounded controller loop;
- proving flights, merge, deployment, and release.

## Preserved boundaries and version transition

1. `runFeatureFlightStepV1` remains the only one-cycle composition seam.
2. Runner V1 remains the authority/claim/execute/validate sequence.
3. `feature-flight-step-store.mjs` remains the create-only, hierarchy-bound
   artifact store, extended by one shared terminal arbiter.
4. The stable `effectClaimId` continues to identify the logical effect and
   excludes timestamps, attempt state, and observations.
5. The legal successful successor remains exactly `active -> complete`.
6. Successful terminal evidence remains `authority:"none"`,
   `gateEligible:false`, and
   `effectContainment:"external_uncertain_repository_unchanged"`.
7. Existing PR publication code is evidence for observation discipline only;
   Feature Flight must not import publication authority or GitHub mutation.

Slice 3 is a breaking persisted-artifact revision:

- Slice 2 claim/result contract `1.0.0` remains immutable legacy evidence.
- Slice 3 claim/result/recovery/terminal contract is `2.0.0`.
- `effectClaimId` remains stable, so a Slice 3 reader must classify legacy bytes
  at the same store location before any fresh observation or effect callback.
- An exact valid Slice 2 terminal triad replays successfully as
  `legacy_replayed`, with no repository/remote/Runner effect callback.
- An exact valid incomplete Slice 2 claim or claim/successor returns ephemeral
  `recovery_required` with reason `legacy_incomplete`; Slice 3 writes nothing to
  that directory and never invokes.
- Malformed or unknown contract versions remain untouched and return ephemeral
  `recovery_required` with reason `unsupported_or_malformed_store`.
- Slice 3 never interprets v1 bytes as v2, overwrites a legacy path, or adds a
  v2 arbiter/receipt to an incomplete v1 directory.

## Requirement IDs

Every implementation and test handoff must map evidence to these stable IDs.

### S3-R1 — Closed remote observation

Trusted dependencies include a separately frozen observer descriptor:

- `observerId:"shield.feature-flight.remote-observer"`;
- `observerVersion:"1.0.0"`;
- `capabilityClass:"remote_branch_read_only"`;
- distinct bounded runtime and executor identities;
- fixed `remoteName:"origin"`;
- `urlNormalization:"shield-git-remote-url-v1"`;
- selected repository root, canonical common-Git directory plus stable
  device/inode identity, and normalized origin URL identity.

The selected full ref is controller-derived as `refs/heads/<mission.branch>`;
neither caller nor observer chooses it. The normalizer accepts only the existing
repository's configured origin URL and produces one bounded identity for
equivalent SCP/SSH forms; credentials, fragments, queries, control characters,
ambiguous paths, and alternate hosts/owners/repositories fail closed.

Add a strict plain-data `feature-flight-remote-observation` value containing:

- schema and contract version;
- `authority:"none"` and a fixed non-authoritative notice;
- selected repository root;
- canonical common-Git directory plus its stable device/inode identity;
- exact observer descriptor identity;
- remote name, normalized remote URL identity, and controller-derived full ref;
- observed remote head (`null` for absent, otherwise exact Git revision);
- host-trusted canonical observation timestamp;
- phase (`pre_claim` or `post_adapter`) and exact controller challenge digest.

Reject proxies, accessors, inherited/symbol/non-enumerable/unknown fields,
malformed paths, control characters, noncanonical timestamps, malformed Git
revisions, and unbounded identities. Snapshot the value once before use.

The observer is a trusted injected capability. Core Feature Flight code performs
no network or Git command itself. Plain-data validation cannot prove that an
injected closure is non-mutating; fresh read-only behavior is explicitly part of
the host TCB and the capability surface accepts no mutation function. The
observer contract grants no authority.

### S3-R2 — Pre-claim remote gate

For an absent store only, after deterministic input replay and existing local
and authority preparation, but before Runner authorization/claim/adapter
callbacks, observe the selected branch once.

The baseline is admissible only when:

- the observation binds the selected worktree's repository/common-Git identity,
  full ref, configured remote identity, trusted observer descriptor, phase, and
  pre-claim challenge; and
- the remote branch is absent or its exact head equals the active mission's
  local HEAD.

Any malformed, unavailable, mismatched, or already-drifted observation returns a
deterministic pre-effect `stopped` projection with zero claim and adapter calls.
It must identify the reason without suggesting destructive reconciliation.

### S3-R3 — Claim binding

Persist the exact pre-claim remote observation and independently trusted
observer descriptor in v2 `claim.json`. Recompute
`attemptDigest` over it. Terminal validation must exact-match it to the prepared
trusted observation. Existing effect-claim identity remains unchanged.

### S3-R4 — Post-adapter drift gate

After one validated adapter result and local repository readback, but before
writing a successful successor, observe the same remote branch again.

The second observation uses a distinct post-adapter challenge and must retain the
exact repository, common-Git device/inode, remote, full-ref, and observer
identities and the exact remote head (including `null`) from the claim. Its
timestamp must be greater than or equal to the pre-claim observation and claim
timestamp and no later than the completion/recovery timestamp. Equality is
allowed; rollback is rejected. Any change, failure, stale phase/challenge, or ambiguity
is post-claim and must produce `recovery_required`; it must never write a
successful successor/result or invoke the adapter again.

### S3-R5 — Atomic terminal arbiter and durable recovery receipt

Add one create-only `terminal.json` arbiter beneath the claimed effect
directory. Success and recovery must atomically compete for this single
pathname before either side writes a successor, `result.json`, or
`recovery.json`. `O_EXCL` on the arbiter—not separate receipt paths—selects the
only terminal kind. A loser reads and follows the exact winner.

The closed v2 arbiter contains:

- schema/artifact/contract identity, `authority:"none"`, and fixed notice;
- effect claim, attempt, and exact claim artifact identities;
- `terminalKind:"success"|"recovery"`;
- a complete canonical intended payload bundle:
  - success: exact successor value and exact result value;
  - recovery: required-null successor value and exact recovery value;
- exact canonical byte lengths and SHA-256 identities for every intended
  materialized artifact;
- hierarchy identity and arbiter timestamp.

The arbiter is itself canonical, mode-0600, hierarchy-bound, synced,
parent-synced, and exactly read back. Once it exists, retries materialize or
verify only its declared payloads. A recovery winner prohibits successor/result
writes. A success winner prohibits recovery writes. Externally introduced mixed
receipts are conflicting ephemeral recovery and are never repaired in place.

Interruption after arbiter creation is recoverable without adapter invocation:
the complete arbiter payload deterministically recreates any missing declared
successor/result or recovery file with create-only exact-byte verification.

Add create-only `recovery.json` as the materialized recovery receipt. It is
closed, canonical, mode-0600, hierarchy-bound, and contains only:

- schema/artifact/contract identity, `authority:"none"`, and fixed notice;
- effect claim and attempt identities;
- exact claim artifact identity;
- required-null successor identity;
- exact reason code and phase;
- exact baseline and required-nullable latest remote observations;
- invocation count classification (`zero_or_unknown` or `one_completed`), never
  an assertion that an uncertain invocation did or did not happen;
- `effectState:"uncertain_do_not_reinvoke"`;
- `gateEligible:false`;
- canonical recorded timestamp;
- a closed next action:
  `inspect_claim_and_remote_non_destructively`.

No free-form command, shell fragment, path supplied by the caller, or authority
claim is permitted.

### S3-R6 — Closed store states

The exact three-level claim hierarchy token remains required for every write
and final read. Closed v2 artifact-presence states are:

| Claim | Arbiter | Successor | Result | Recovery | Classification |
| --- | --- | --- | --- | --- | --- |
| absent | absent | absent | absent | absent | `absent` |
| exact | absent | absent | absent | absent | `claim_incomplete` |
| exact | success | absent/exact | absent/exact | absent | `success_materializable` or `success_terminal` |
| exact | recovery | absent | absent | absent/exact | `recovery_materializable` or `recovery_terminal` |
| absent | any | any | any | any | `malformed` |
| exact | absent | any successor | any result/recovery | any | `malformed` |
| exact | success | any | any | any recovery | `conflicting` |
| exact | recovery | any | any result | any | `conflicting` |

`successor_without_claim` is always malformed. `claim_successor` is the only
term for a claim plus successor. Legacy v1 states are classified by the separate
compatibility matrix and never folded into these v2 states.

Closed recovery phases are:

- `store_replay`, `adapter`, `validation`, `local_readback`,
  `remote_postcheck`, `terminal_arbitration`, `successor_materialization`,
  `result_materialization`, `recovery_materialization`, `final_readback`.

Closed durable reason codes are:

- `interrupted_after_claim`, `adapter_uncertain`, `validation_failed`,
  `local_readback_unavailable`, `local_repository_changed`,
  `remote_observation_unavailable`, `remote_identity_changed`, `remote_drift`,
  `terminal_arbitration_uncertain`, `successor_materialization_uncertain`,
  `result_materialization_uncertain`, `recovery_materialization_uncertain`,
  `final_readback_uncertain`.

Ephemeral-only reasons are `legacy_incomplete`,
`unsupported_or_malformed_store`, `terminal_conflict`, and `store_unavailable`.
Every code maps to exactly one phase, allowed invocation classification, and
required-nullable observation fields plus the required-null recovery successor
field in the checked-in validator.

### S3-R7 — Deterministic retry

Normative entry order is:

1. Validate and snapshot caller/dependencies.
2. Replay only deterministic plan/state/Runner evidence required to derive the
   stable `effectClaimId`; no repository observer, remote observer, Runner
   authorization/claim, adapter, or result-validator callback may run.
3. Read and classify durable store state.
4. Replay an exact legacy/v2 success, replay/materialize an exact v2 arbiter, or
   terminalize an exact incomplete v2 claim as recovery—still with no effect
   callbacks.
5. Only when the store is absent, run full local/remote preflight and Runner.

"Zero callbacks/effects" permits deterministic Runner-input loading and store
reads/writes required for location, replay, and materialization. It excludes
repository observation, remote observation, Runner authorization/claim,
adapter invocation, and result validation.

Retry behavior is conservative and exact:

- absent store: normal preflight may proceed;
- exact v1/v2 successful terminal: return `legacy_replayed` or `replayed` with
  zero effect callbacks;
- exact recovery terminal: return `recovery_required` with the same durable
  recovery identity and zero effect callbacks;
- exact v2 arbiter with missing declared files: materialize exact winner bytes,
  then replay with zero effect callbacks;
- exact v2 claim-only: atomically elect and materialize recovery, never
  authorize or invoke;
- exact incomplete v1 claim or claim/successor: return ephemeral
  `legacy_incomplete`, never write or invoke;
- malformed, conflicting, or unreadable state: return ephemeral
  `recovery_required`, never mutate uncertain evidence and never invoke.

There is no automatic takeover. This is deterministic restart handling without
duplicating a potentially completed effect.

### S3-R8 — Recovery precedence

Durable state classification precedes fresh local/remote observation and all
effect callbacks. After a new claim boundary, recovery overrides ordinary
Runner stops and observation errors. Success may be returned only after exact
claim/arbiter/successor/result readback. Durable recovery may be returned only
after exact claim/arbiter/recovery plus the required-null successor field
readback.

If success and recovery race, the exact valid arbiter winner controls. The loser
must not write its receipt. An uncertain arbiter create is reread; an exact
winner is followed, while absent/malformed/conflicting readback returns
ephemeral recovery without further mutation.

### S3-R9 — No remote mutation

Production Slice 3 modules must not call process spawning, `fetch`, GitHub APIs,
or Git directly. Tests must prove that only the injected observer is called and
that no mutation capability is accepted. Remote advancement or divergence
returns an inspection-only recovery disposition.

### S3-R10 — Operator handoff

Both pre-claim stops and post-claim recovery projections expose a concise closed
handoff containing reason, phase, flight/mission/effect identity, durable
artifact identities when present, and one enumerated next action. It must not
contain fabricated commands, approval, acceptance, or reconciliation claims.

## Interruption matrix

| Boundary | Retry behavior | Effect callbacks on retry | Durable outcome |
| --- | --- | ---: | --- |
| before claim | rerun full preflight | at most one after a new claim | normal |
| directory exists without valid claim | fail closed | 0 | ephemeral recovery |
| v2 claim durable, adapter state unknown | elect recovery terminal | 0 | claim + recovery arbiter + recovery |
| adapter throws or validation fails | elect recovery terminal | 0 | claim + recovery arbiter + recovery |
| post-adapter local/remote read fails | elect recovery terminal | 0 | claim + recovery arbiter + recovery |
| remote changes during adapter | elect recovery terminal | 0 | claim + recovery arbiter + recovery |
| success arbiter durable, files absent/partial | materialize exact arbiter payload | 0 | successful terminal |
| recovery arbiter durable, receipt absent | materialize exact arbiter payload | 0 | recovery terminal |
| success and recovery race | replay/materialize arbiter winner | 0 | exactly one terminal kind |
| exact v1 terminal | replay legacy success | 0 | immutable v1 triad |
| incomplete v1 state | fail closed without mutation | 0 | ephemeral recovery |
| final readback uncertain | fail closed | 0 | ephemeral recovery |

## Remote-drift matrix

| Baseline remote head | Later remote head | Disposition |
| --- | --- | --- |
| absent | absent | may continue |
| local HEAD | same local HEAD | may continue |
| absent | any revision | recovery required |
| local HEAD | different revision | recovery required |
| any preexisting different revision | n/a | pre-effect stopped |
| observation unavailable/malformed | n/a | stopped before claim; recovery after claim |

No distinction between fast-forward and divergence authorizes action in this
slice. Both require non-destructive inspection.

## Implementation file allowlist

New:

- `packages/shield-team-system/scripts/operations/feature-flight-recovery.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-recovery.test.mjs`
- `docs/operations/feature-flight-recovery.md`
- `packages/shield-team-system/docs/operations/feature-flight-recovery.md`

Modify:

- `packages/shield-team-system/scripts/operations/feature-flight-step-store.mjs`
- `packages/shield-team-system/scripts/operations/feature-flight-step.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-step.test.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-controller.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `docs/operations/feature-flight-step.md`
- `packages/shield-team-system/docs/operations/feature-flight-step.md`
- `docs/operations/persisted-artifact-contract-matrix.md`
- `packages/shield-team-system/docs/operations/persisted-artifact-contract-matrix.md`
- `packages/shield-team-system/README.md`
- this plan file

No changes are authorized to Runner V1, authority/journal code, governed May,
publication adapters, GitHub mutation code, package exports, or CLI surfaces.

## Required tests and evidence matrix

Tests must cite requirement IDs in names or a checked-in evidence table.

- S3-R1/R2: strict hostile descriptor/observation objects; absent/equal/adrift
  remote; wrong root/common-Git device/inode/remote/full-ref/observer;
  unavailable observer; challenge replay, wrong phase, cached response, equal
  timestamps, timestamp rollback, URL-normalization equivalence/rejection; all
  with exact pre-effect callback counts.
- S3-R3: claim substitution and attempt-digest recomputation for every remote
  observation identity.
- S3-R4: post-adapter absent-to-present and revision-to-different-revision drift,
  identity substitution, unavailable/malformed second observation, and no
  successor/result.
- S3-R5/R6: arbiter/recovery schema, canonical bytes, modes, symlink/alias,
  partial write, sync/close, parent/common-Git transplant, mixed terminal
  artifacts, and exact final readback. Barrier-control every result-versus-
  recovery interleaving and every interruption before/after arbiter durability.
- S3-R7/R8: durable-state-before-observer ordering; retry from v2 claim-only,
  success arbiter, recovery arbiter, both terminal kinds, malformed state,
  concurrent retries, arbiter conflict, and every reachable interruption
  boundary; prove zero effect callbacks and no second invocation.
- Compatibility: exact v1 success replay, v1 claim-only, v1 claim/successor,
  malformed/unknown versions, no v1 mutation, and no v1/v2 reinterpretation.
- S3-R9: source/static guard and injected-call accounting proving no remote
  mutation capability exists.
- S3-R10: closed handoff grammar and no raw command/free-form authority text.
- Regression: existing Slice 2 successful, stopped, replay, concurrency, hostile
  store, operator-disposition, fixed Daisy, and gate-ineligible cases remain.
- Validation: focused Slice 3 tests, package surface/pack consumer, full
  `@shield/team-system`, `nx affected` for exact base/head, Multiband tests,
  mirrored docs, allowlist, and `git diff --check`.

## Validation policy

During implementation use focused Slice 3 tests. Before exact-revision review,
run `nx affected` from `ae10c02867fcf6868d28d820a0b09904751805be` to
implementation HEAD and record executed/skipped projects. Mack performs one
uncached full team-system run because this slice changes the coarse existing
`@shield/team-system` project boundary; issue #255 tracks finer Nx decomposition.

The Multiband production build may be classified environment-blocked only when
compilation/type-checking succeeds and the sole failure is the already-known
missing `POSTGRES_PRISMA_URL`. It may not be reported as product success.

## Stop conditions

Stop and return to Fury before implementation if the design would require:

- claim takeover or automatic adapter reinvocation;
- caller-asserted remote truth;
- remote mutation, GitHub-specific publication authority, or shell commands in
  a recovery artifact;
- changing Runner, authority, journal, permission, or human-gate semantics;
- widening beyond the listed files or entering later #251 slices.
