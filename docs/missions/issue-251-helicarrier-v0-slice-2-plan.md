# Hill Plan — Issue #251 Helicarrier Slice 2

## Exact basis

- Repository: `RanSolo/shield-workspace`
- Branch: `agent/issue-251-helicarrier-v0-slice-2`
- Base: `59c896c6c24594c5d2ab6e61d312bdf0e6bd443c`
- Initial plan commit: `d75ab11375d75658568be6e8fa6dab36c4c4babc`
- Initial plan SHA-256:
  `97e04706627c08eb387fb21dbbfea82603ce34e8b1379e53b60be03b292d6763`
- Mission: `mission:issue-251-slice-2`
- Mission revision: `sha256:CYMfPAQVBT8bwxdtthxUfT-oN1F8V7mN8ZuZ8L9BOeU`

This revision corrects the initial plan after Fury review. Its exact commit and
SHA-256 are supplied externally for re-review.

## Revised decision

Slice 2 proves the smallest safe effectful Helicarrier step: one already-active,
explicitly authorized, read-only Daisy coordination cycle.

The controller:

1. structurally replays the merged Feature Flight plan/state boundary;
2. obtains Runner V1 input from trusted schema-9 journal replay, never from the
   invocation manifest;
3. obtains adapter/runtime/executor identity from a trusted host descriptor;
4. claims one stable logical step atomically in a host-owned external store;
5. invokes the trusted Daisy adapter at most once;
6. persists one legal `active -> complete` successor state; and
7. writes the terminal result receipt last so no incomplete artifact can look
   terminal.

This slice excludes May because behavioral implementation must continue through
`runGovernedMayDispatchStepV1`. It excludes Mack because generic V0.3 dispatch
does not admit Mack. It excludes Fury because review-gate composition is a later
slice. Human seats remain impossible.

No `shield-ops flight run` CLI is added. A CLI cannot safely synthesize trusted
journal replay, adapter identity, or host claim-store dependencies from JSON.

## Reuse map

| Concern | Canonical owner reused unchanged |
| --- | --- |
| Exact plan/state/predecessor byte replay | `computeFeatureFlightStatus` |
| Plan/state schema, lane consistency, current wave, legal transitions | `flight-contracts.mjs` |
| Trusted mission projection and exact Runner input | host dependency backed by existing schema-9 replay and Runner V1 input construction |
| Authorization, identity checks, one-cycle stop semantics | `runRunnerCycle` and Runner V1 validators |
| Daisy seat and `coordination` effect constraints | Runner V1 role/effect contracts plus this narrower controller policy |
| Canonical JSON and snapshot primitives | `common.mjs` |

The new claim store adapts the durability pattern of `seat-dispatch-store.mts`
but owns a distinct Feature Flight composition artifact and external namespace.
It does not copy the seat-dispatch event/receipt schema.

## New files and API

Add:

- `packages/shield-team-system/scripts/operations/feature-flight-step-store.mjs`;
- `packages/shield-team-system/scripts/operations/feature-flight-step.mjs`;
- `packages/shield-team-system/tests/operations-feature-flight-step.test.mjs`.

`feature-flight-step.mjs` exports:

- `FEATURE_FLIGHT_STEP_CONTRACT_VERSION = "1.0.0"`;
- closed artifact validators;
- `runFeatureFlightStepV1(input, trustedDependencies)`.

The API is an internal packaged operations seam for later CLI composition, not
a new public package export.

## Caller input

The caller supplies exactly:

- plan path and expected digest;
- current state path, expected digest, and sequence;
- paired predecessor path/digest when the current state is non-genesis;
- `maxSteps:1`;
- one closed routing hint containing only `flightId` and `missionId`.

The caller supplies no Runner projection, governance state, authorization,
adapter identity, runtime identity, executor identity, timestamp, repository
expectation, store root, output path, result status, or PASS-like decision.

The plan/state paths retain the exact snapshot/path constraints from Slice 1.
The routing hint must name the exact active mission discovered below; it grants
no authority.

## Trusted dependency boundary

`trustedDependencies` is snapshotted before the first await and contains only
own enumerable data fields:

- `loadRunnerCycleInput(context)` — replays the current schema-9 mission journal
  and returns one Runner V1 input plus its exact canonical bytes/digest;
- `authorizeRunner(plan)` — existing Runner V1 authorizer;
- `invokeDaisyAdapter(plan, decision, descriptor)` — sole adapter invocation;
- `validateDaisyResult(plan, executorResult)` — pure Runner V1 validation;
- `observeRepository(root)` — host-observed exact root/branch/HEAD/clean tuple;
- `adapterDescriptor` — trusted closed
  `{adapterId,adapterVersion,capabilityClass,runtimeId,executorId}`;
- `claimStoreRoot` — trusted host-owned canonical absolute directory;
- `clock.now()` — trusted canonical UTC millisecond timestamp;
- the atomic step-store and snapshot primitives, replaceable only in tests.

Proxy-backed, accessor-backed, inherited, missing, extra, or mutable dependency
shapes fail before the store or adapter is touched. Descriptor values are
snapshotted and frozen. Adapter output cannot override attribution.

Runtime and host-tool executor remain separate identities. The result receipt
states only that the trusted host supplied and observed those identities; it
does not treat model self-report as host observation.

The only admitted adapter policy is fixed before claim:

- `adapterId:"shield.daisy.readonly"`;
- `adapterVersion:"1.0.0"`;
- `capabilityClass:"read_only_coordination"`;
- Runner `actionId:"action:feature-flight.daisy.reconnaissance"`;
- Runner `effectClass:"coordination"`;
- Runner `validationId:"validation:feature-flight.daisy-result-v1"`.

The function itself remains a host-trusted dependency; the contract does not
claim cryptographic containment of external model behavior. Repository
readback proves only that the selected worktree remained unchanged. The result
records external effect containment as uncertain and stays gate-ineligible.
Any other descriptor, action, effect class, or validation ID fails before the
claim store is touched.

## Trusted Runner binding

The returned Runner input is validated unchanged by Runner V1 and must satisfy:

- mission/subject/revision/evaluated journal sequence agree throughout its
  projection, resolved mode context, and plan;
- its canonical digest is computed by the controller and bound into the step;
- `plan.seatId === "daisy"`;
- `plan.actionId`, `plan.effectClass`, and `plan.validationId` equal the fixed
  Daisy adapter policy above;
- `plan.stopCondition === "after_one_cycle"`;
- Daisy participates and is executable under the replayed projection;
- governance, mission authorization, execution status, and execute readiness
  are accepted only from the trusted replayed projection;
- Runner `evaluatedThroughSequence` remains the journal sequence and is never
  equated with Feature Flight state sequence.

The Runner mission ID equals the active Feature Flight mission ID. Runner
revision and journal sequence remain independent from the flight-state sequence
and repository HEAD and are separately recorded.

## Active Feature Flight selection

`computeFeatureFlightStatus` remains the structural snapshot owner. For this
slice, the expected structural result is its existing
`authority-verification-required` global stop, because `active` is an
authority-derived status.

After trusted Runner replay succeeds, the controller may select exactly one
mission only when:

- the route names an exact plan mission;
- current state status is `active`;
- that mission's lane names it as the sole `activeMissionId`;
- every other lane has no active mission;
- `mission.dependsOn` is empty; this slice does not authenticate integrated
  predecessor authority;
- its state revision is lowercase 40-hex;
- plan mission worktree and branch equal the host-observed repository root and
  branch; and
- observed HEAD equals the active state's revision and the worktree is clean.

The authority global stop is not ignored generally. It is discharged only for
this exact active Daisy mission by the separately trusted Runner replay and
authorization decision. For the selected mission, the optional immediate
predecessor may show only legal `authorized` or `active` status. Any other
authority-derived status in current or predecessor state, including every
other mission, remains blocked. After that narrow discharge, the controller
reapplies the existing operator-disposition rule independently: any current
mission in `blocked` or `failed` status stops before claim, even when the Slice
1 projection reported the higher-precedence authority stop first.

## Stable effect claim and attempt evidence

The exclusive namespace key is `effectClaimId`, not the variable attempt
identity. It is lowercase 64-hex SHA-256 over UTF-8 canonical JSON bytes with
no trailing newline, using domain `shield-feature-flight-effect-claim.v1` and
exactly:

- flight ID and exact resolved-plan digest;
- mission ID, Runner subject ID, and Runner mission revision;
- Runner action ID, effect class, and effect key.

Timestamp, current-state digest/sequence, journal sequence, cycle ID,
Runner-input digest, adapter/runtime/executor descriptor, artifact paths, store
location, and process identity are excluded from `effectClaimId`.

Variable attempt evidence is bound inside the claim: exact current and
predecessor state identities, flight sequence, Runner input digest, journal
sequence, cycle ID, validation ID, repository observation, adapter descriptor,
and timestamp. Once an `effectClaimId` directory exists, different attempt
evidence conflicts and returns recovery-required; it never creates another
executable step. A legal alternate `active -> active` state or later journal
replay with the same effect claim therefore cannot invoke again.

## Host-owned atomic store

`feature-flight-step-store.mjs` implements a closed external store rooted only
at trusted `claimStoreRoot`.

- The root must already exist, be canonical, non-symlink, mode 0700, and lie
  outside the repository root and every plan worktree under exact and
  ASCII-folded/canonical comparison.
- Artifact paths are derived internally as
  `<root>/effects/<effectClaimId>/{claim.json,successor.json,result.json}`; callers do not
  choose them.
- The first claimant atomically creates `<effectClaimId>` with exclusive directory
  creation. Parent identity and directory durability are synced and verified.
- If the directory already exists, no caller may invoke the adapter. The store
  snapshots and classifies the exact artifacts as terminal replay, in-progress
  recovery required, malformed/conflicting, or unavailable.
- Concurrent calls and calls attempting a different external parent resolve to
  the same trusted namespace; at most the exclusive creator may continue.
- Every file is create-only mode 0600, written through retained non-symlink
  handles, synced, parent-synced, closed, and read back exactly.
- Lock/directory/file creation, partial write, sync, close, identity drift, or
  readback uncertainty never reports claim or terminal success.

The store exports only bounded `claimStep`, `readStep`, `writeSuccessor`, and
`writeResult` operations. It performs no adapter or authority work.

## Artifact contracts

All artifacts are closed canonical JSON with a trailing newline and
`authority:"none"`.

### Claim

`feature-flight-step-claim` schema 1 binds:

- effect claim ID, variable attempt identity digest, and contract/tool identity;
- exact plan/current/predecessor identities;
- active mission/lane/wave and repository tuple;
- trusted Runner input digest and independent Runner identity fields;
- trusted adapter/runtime/executor descriptor;
- host-trusted claim timestamp;
- an explicit notice that the claim grants no authority.

The claim must be durably read back before the Runner claim callback returns
`claimed` and before adapter invocation. Runner is entered first so its
authorizer retains precedence over claim creation.

### Successor

Only Runner `advanced/effect_completed` may produce a successor. The selected
mission transitions legally from `active` to `complete`:

- sequence increments once;
- predecessor digest equals the exact current-state digest;
- tool is `flight-state-successor-recorder@1.0.0`;
- mission revision remains the same observed 40-hex HEAD;
- its lane `activeMissionId` becomes null;
- all other state is preserved except recomputed current wave;
- `authorityEvidence` remains null.

The existing state validator and immediate-transition validator must accept the
successor before any terminal artifact write.

Any Runner post-dispatch stopped result—including executor failure, uncertainty,
malformed output, identity mismatch, validator failure, or validator mismatch—
is `recovery_required` and produces no successor. Pre-dispatch Runner stops
produce no adapter call and no successor.

### Result receipt

`feature-flight-step-result` schema 1 binds:

- exact claim and successor artifact identities;
- validated Runner advanced result and its canonical digest;
- repository observations before claim and after the cycle, which must be
  byte-identical because Daisy is read-only;
- trusted adapter/runtime/executor descriptor;
- invocation count exactly 1;
- host-trusted completion timestamp not earlier than claim timestamp;
- outcome exactly `completed`;
- `effectContainment:"external_uncertain_repository_unchanged"`,
  `gateEligible:false`, and a notice that the triad is coordination evidence,
  not human acceptance or implementation authority.

Write order is claim, adapter, successor, result. The result is terminal only
when exact claim-successor-result validation succeeds. Because result is written
last, a successor without a result is visibly incomplete. After result write,
all three are re-read and cross-validated before returning success.

## Execution order

1. Snapshot/validate caller and trusted dependency shapes.
2. Snapshot plan/state/predecessor through the Slice 1 boundary.
3. Load and validate the trusted Runner input and fixed adapter policy.
4. Select the exact active Daisy mission and validate independent identity
   domains.
5. Observe exact mission worktree/branch/HEAD/clean state.
6. Derive invariant effect claim ID plus variable attempt digest and inspect the
   trusted store.
7. Return exact terminal replay or recovery-required for any existing step.
8. Invoke Runner V1. Its authorizer runs before the claim callback.
9. The claim callback atomically claims/writes/readbacks the step; only a
   claimed result permits continuation.
10. The adapter callback counts and permits exactly one Daisy invocation.
11. Runner stops reached before its claim callback return `stopped`. After the
    claim callback is reached, every `invocation_claim_*` or post-dispatch stop
    triggers an exact store reread: a terminal triad returns `replayed`; any
    nonterminal, conflicting, absent, or uncertain claim state returns
    `recovery_required`. It never returns ordinary `stopped`.
12. On Runner advanced, re-observe unchanged repository state.
13. Derive and validate the legal successor, then write/read it.
14. Derive result binding the successor, write/read it last, and re-read the
    complete triad.
15. Return `completed` only after exact terminal readback.

## Result projection

Closed result variants are:

- `completed`: one adapter invocation and exact terminal triad;
- `replayed`: exact existing terminal triad and zero invocation;
- `stopped`: authorization/pre-dispatch Runner stop and zero invocation;
- `recovery_required`: claim-only, successor-only, malformed/conflicting store,
  any post-dispatch stop, or any durability/readback/identity uncertainty.

There is no `failed` terminal variant in this slice. Every projection preserves
flight/state/Runner/adapter identities and grants no authority.

## Files

- Retain this plan.
- Add `scripts/operations/feature-flight-step-store.mjs`.
- Add `scripts/operations/feature-flight-step.mjs`.
- Update `scripts/operations/flight-contracts.mjs` only with a pure legal
  active-to-complete successor builder.
- Add `tests/operations-feature-flight-step.test.mjs`.
- Update `tests/operations-feature-flight-controller.test.mjs` for the explicit
  authority-stop-to-trusted-active composition boundary.
- Update `tests/package-surface.test.mjs` for packed internal file presence.
- Add mirrored `docs/operations/feature-flight-step.md` files.
- Update both persisted-artifact contract matrices and package README.

No Runner, governed-May, seat-dispatch, authority, permission, journal, package
export, or CLI source changes.

## Required tests

- Valid active Daisy cycle: trusted authorization, one atomic claim, one adapter
  call, legal active-to-complete successor, result-last terminal triad.
- Exact retry returns replay with zero authorizer/adapter/write calls.
- Simultaneous calls expose at most one adapter invocation; the concurrent
  loser rereads the store and returns replay or recovery-required, never an
  ordinary pre-dispatch stop.
- A legal alternate `active -> active` state and later trusted journal replay
  with the same effect claim cannot produce a second invocation.
- Caller attempts to vary timestamps, output locations, store roots, Runner
  input, adapter identity, or repository expectations are impossible or do not
  change step identity.
- Post-`mkdir` claim-write failure leaves recovery-required evidence and never
  invokes. Every `invocation_claim_*` path follows the store-reread matrix.
- Stale/malformed trusted projection, distinct flight/journal sequences, wrong
  mission/worktree/branch/HEAD, dirty state, wrong lane/active mission, and
  nonempty dependencies stop before claim and adapter.
- Nonempty dependencies, Mack, May, Fury, human seats, non-coordination
  effects, non-fixed action/validation IDs, and nonmatching adapter policies
  fail before claim. May cannot bypass governed-May.
- A selected active Daisy mission plus any other current `blocked` or `failed`
  mission reapplies the operator stop and invokes neither claim nor adapter.
- Every Runner stop reached before its claim callback invokes no adapter and is
  `stopped`. Claim-boundary and post-dispatch stops follow the mandatory store
  reread and return replay or recovery-required with no new successor.
- Adapter throw, second-call attempt, attribution spoof, repository mutation,
  and validator defect cannot report success.
- Alternate-parent replay, claim-only, successor-only, result without exact
  predecessor artifacts, malformed/noncanonical bytes, symlinks, aliases,
  traversal, casefold collisions, mode drift, partial write, sync, close,
  directory durability, and final readback faults fail closed.
- Successor passes existing state and immediate-edge validators; planned to
  complete/failed shortcuts remain rejected.
- Focused tests, package surface/pack, full team-system, Multiband, build,
  mirrored-doc equality, changed-path allowlist, and `git diff --check` pass.
- Mack validates and Fury reviews the exact implementation revision.

## Exclusions

- No May implementation, Fury review, Mack validation, human-seat, or generic
  specialist dispatch.
- No CLI run/resume, partial recovery, lease takeover, multi-step loop, remote
  fetch/push/drift/reconciliation, review gates, proving flight, merge,
  deployment, release, cleanup, or destructive effect.
- No new authority class, signed schema, journal entry, seat-dispatch schema,
  or caller-asserted authorization/attribution.
