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

## Existing contracts reused unchanged

1. `runFeatureFlightStepV1` remains the only one-cycle composition seam.
2. Runner V1 remains the authority/claim/execute/validate sequence.
3. `feature-flight-step-store.mjs` remains the create-only, hierarchy-bound
   artifact store.
4. The stable `effectClaimId` continues to identify the logical effect and
   excludes timestamps, attempt state, and observations.
5. The legal successful successor remains exactly `active -> complete`.
6. Successful terminal evidence remains `authority:"none"`,
   `gateEligible:false`, and
   `effectContainment:"external_uncertain_repository_unchanged"`.
7. Existing PR publication code is evidence for observation discipline only;
   Feature Flight must not import publication authority or GitHub mutation.

## Requirement IDs

Every implementation and test handoff must map evidence to these stable IDs.

### S3-R1 — Closed remote observation

Add a strict plain-data `feature-flight-remote-observation` value containing:

- schema and contract version;
- `authority:"none"` and a fixed non-authoritative notice;
- selected repository root and canonical common-Git directory;
- remote name and normalized remote URL identity;
- selected branch;
- observed remote head (`null` for absent, otherwise exact Git revision);
- host-trusted canonical observation timestamp;
- runtime/tool identity for the observer.

Reject proxies, accessors, inherited/symbol/non-enumerable/unknown fields,
malformed paths, control characters, noncanonical timestamps, malformed Git
revisions, and unbounded identities. Snapshot the value once before use.

The observer is a trusted injected capability. Core Feature Flight code performs
no network or Git command itself. The observer contract permits read-only remote
observation only and grants no authority.

### S3-R2 — Pre-claim remote gate

After all existing local and authority preparation, but before Runner
authorization/claim/adapter callbacks, observe the selected branch once.

The baseline is admissible only when:

- the observation binds the selected worktree's repository/common-Git identity,
  branch, configured remote identity, and trusted observer identity; and
- the remote branch is absent or its exact head equals the active mission's
  local HEAD.

Any malformed, unavailable, mismatched, or already-drifted observation returns a
deterministic pre-effect `stopped` projection with zero claim and adapter calls.
It must identify the reason without suggesting destructive reconciliation.

### S3-R3 — Claim binding

Persist the exact pre-claim remote observation in `claim.json`. Recompute
`attemptDigest` over it. Terminal validation must exact-match it to the prepared
trusted observation. Existing effect-claim identity remains unchanged.

### S3-R4 — Post-adapter drift gate

After one validated adapter result and local repository readback, but before
writing a successful successor, observe the same remote branch again.

The second observation must retain the exact repository, common-Git, remote,
branch, and observer identities and the exact remote head (including `null`)
from the claim. Only the timestamp may advance. Any change, failure, or ambiguity
is post-claim and must produce `recovery_required`; it must never write a
successful successor/result or invoke the adapter again.

### S3-R5 — Durable recovery receipt

Add create-only `recovery.json` beneath the claimed effect directory. It is a
closed, canonical, mode-0600, hierarchy-bound artifact written with the same
durability and readback guarantees as the existing artifacts.

It contains only:

- schema/artifact/contract identity, `authority:"none"`, and fixed notice;
- effect claim and attempt identities;
- exact claim artifact identity;
- optional successor identity when one already exists;
- exact reason code and phase;
- exact baseline and latest remote observations when available;
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

Extend store replay to distinguish:

- absent;
- claim only;
- claim plus successor;
- successful terminal claim/successor/result;
- recovery terminal claim/recovery;
- recovery terminal claim/successor/recovery;
- malformed/conflicting mixtures.

`result.json` and `recovery.json` are mutually exclusive. A recovery receipt
cannot coexist with a result. The exact three-level claim hierarchy token must
remain required for all writes and final reads.

### S3-R7 — Deterministic retry

Retry behavior is conservative and exact:

- absent store: normal preflight may proceed;
- exact successful terminal: return `replayed`, zero callbacks/effects;
- exact recovery terminal: return `recovery_required` with the same durable
  recovery identity, zero callbacks/effects;
- claim-only or claim-plus-successor: write or replay a recovery receipt, never
  authorize or invoke;
- malformed, conflicting, or unreadable state: return ephemeral
  `recovery_required`, never mutate uncertain evidence and never invoke.

There is no automatic takeover. This is deterministic restart handling without
duplicating a potentially completed effect.

### S3-R8 — Recovery precedence

After the claim boundary, a recoverable classification overrides ordinary
Runner stops and local/remote observation errors. A successful result may be
returned only after exact terminal readback. A recovery result may be returned
as durable only after exact claim/recovery (and optional successor) readback.

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

| Boundary | Retry behavior | Adapter calls on retry | Durable outcome |
| --- | --- | ---: | --- |
| before claim | rerun full preflight | at most one after a new claim | normal |
| directory exists without valid claim | fail closed | 0 | ephemeral recovery |
| claim durable, adapter not known | never invoke | 0 | claim + recovery |
| adapter throws or validation fails | never invoke | 0 | claim + recovery |
| post-adapter local/remote read fails | never invoke | 0 | claim + recovery |
| remote changes during adapter | never invoke | 0 | claim + recovery |
| successor durable, result absent | never invoke | 0 | claim + successor + recovery |
| result durable and exact | replay success | 0 | successful triad |
| recovery durable and exact | replay recovery | 0 | recovery terminal |
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
- `docs/operations/persisted-artifact-contract-matrix.md`
- `packages/shield-team-system/docs/operations/persisted-artifact-contract-matrix.md`
- `packages/shield-team-system/README.md`
- this plan file

No changes are authorized to Runner V1, authority/journal code, governed May,
publication adapters, GitHub mutation code, package exports, or CLI surfaces.

## Required tests and evidence matrix

Tests must cite requirement IDs in names or a checked-in evidence table.

- S3-R1/R2: strict hostile observation objects; absent/equal/adrift remote;
  wrong root/common-Git/remote/branch/observer; unavailable observer; all with
  exact pre-effect callback counts.
- S3-R3: claim substitution and attempt-digest recomputation for every remote
  observation identity.
- S3-R4: post-adapter absent-to-present and revision-to-different-revision drift,
  identity substitution, unavailable/malformed second observation, and no
  successor/result.
- S3-R5/R6: recovery artifact schema, canonical bytes, modes, symlink/alias,
  partial write, sync/close, parent transplant, mixed terminal artifacts, and
  exact final readback.
- S3-R7/R8: retry from claim-only, successor-only, recovery terminal, success
  terminal, malformed state, concurrent retries, recovery-write conflict, and
  every reachable interruption boundary; prove zero reinvocation.
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
