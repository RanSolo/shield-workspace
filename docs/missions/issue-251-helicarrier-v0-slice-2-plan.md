# Hill Plan — Issue #251 Helicarrier Slice 2

## Exact basis

- Repository: `RanSolo/shield-workspace`
- Branch: `agent/issue-251-helicarrier-v0-slice-2`
- Base and initial HEAD: `59c896c6c24594c5d2ab6e61d312bdf0e6bd443c`
- Mission: `mission:issue-251-slice-2`
- Mission revision: `sha256:CYMfPAQVBT8bwxdtthxUfT-oN1F8V7mN8ZuZ8L9BOeU`
- Parent issue: #251
- Predecessor implementation: PR #254 / Feature Flight status controller

This file will be committed before implementation and supplied to Fury with
its exact commit and SHA-256. It does not attempt a self-referential binding.

## Decision

Slice 2 adds one host-composable `runFeatureFlightStepV1` boundary. It composes
the merged Feature Flight status projection with the existing Runner V1
authorization and one-cycle contract. It adds only the durable composition
artifacts missing between those boundaries:

1. an invocation manifest;
2. an execute-once claim;
3. a terminal step-result receipt; and
4. one closed successor Feature Flight state.

The trusted host supplies an existing Runner V1 authorizer, exactly one
adapter, a pure validator, and repository observation. Runner V1 validates the
authorization decision and execution identities. Helicarrier neither parses a
new authority format nor accepts a caller boolean such as `authorized: true`.

This slice intentionally adds no `shield-ops flight run` command. A CLI cannot
safely manufacture trusted authorizer/adapter dependencies from JSON. The
module is the bounded composition seam that a later slice may wire to a real
host adapter. The existing `shield-ops flight status` command remains the only
operator command.

## Reuse map

| Concern | Existing owner reused unchanged |
| --- | --- |
| Exact plan/state/predecessor snapshots and candidate selection | `computeFeatureFlightStatus` in `feature-flight-controller.mjs` |
| Plan/state schema, transitions, current-wave calculation | `flight-contracts.mjs` |
| Authorization decision, one-cycle execution, identity validation, stop semantics | `runRunnerCycle` and Runner V1 validators from `@shield/team-system/runner` |
| Reserved-output identity, durable write, file/parent sync, rollback | `retainReservedOutput`, `writeReservedOutput`, `snapshotFile`, and `stableJson` from `common.mjs` |
| Exact Git root/branch/HEAD/clean observation | injected host observer returning the closed repository observation defined below; no remote observation in this slice |

Seat dispatch receipts and governed-May dispatch remain authoritative sources
for their own domains but are not copied into the Feature Flight composition
artifacts. The Runner authorizer/adapter may itself be backed by those systems;
Helicarrier treats their details as opaque existing authority and execution
boundaries.

## New module boundary

Add `packages/shield-team-system/scripts/operations/feature-flight-step.mjs`.
It exports:

- `FEATURE_FLIGHT_STEP_CONTRACT_VERSION = "1.0.0"`;
- closed validators for the invocation manifest, claim, and result receipt;
- `runFeatureFlightStepV1(input, trustedDependencies)`.

The module is packaged as an internal operations component for later CLI
composition. It is not a new public package export in this slice.

## Closed invocation input

`runFeatureFlightStepV1` accepts exactly:

- the exact status inputs already accepted by `computeFeatureFlightStatus`:
  plan path/digest, state path/digest/sequence, and the paired predecessor
  path/digest when non-genesis;
- one closed `feature-flight-step-invocation` schema version 1 manifest;
- three distinct absolute reserved output paths: claim, result, successor;
- `maxSteps`, exactly integer `1`.

The invocation manifest contains exactly:

- `schemaVersion:1`, `manifestType:"feature-flight-step-invocation"`;
- `flightId`, `missionId`, `lane`, and `activationWave`, exactly matching the
  status projection's sole `nextCandidate`;
- exact plan and current-state artifact identities;
- nullable predecessor artifact identity matching the status projection;
- exact repository expectation `{root,branch,head,clean:true}` where root is
  canonical absolute, branch is a nonempty string, and head is lowercase
  40-hex;
- exact adapter identity `{adapterId,adapterVersion,runtimeId,executorId}`;
- one Runner V1 cycle input;
- `resultStatusOnCompleted:"complete"` and
  `resultStatusOnFailed:"failed"` as fixed policy constants;
- one canonical host-trusted `startedAt` timestamp;
- exact relative output names for claim, result, and successor. Paths in the
  manifest are names only; the separately supplied absolute paths must have
  those basenames and share one external canonical parent.

The Runner plan must bind the candidate and flight state:

- `missionId` equals the candidate mission ID;
- `seatId` is one of `daisy`, `fury`, `may`, or `mack` and equals an explicit
  closed candidate-seat mapping supplied by the resolved plan extension in the
  manifest; no human seat is dispatchable;
- `cycleId`, `subjectId`, `revisionId`, `evaluatedThroughSequence`, action,
  effect class/key, validation ID, modes, and allowlist remain Runner-owned;
- `evaluatedThroughSequence` equals the current flight-state sequence;
- `stopCondition` is `after_one_cycle`;
- the Runner projection is execute-ready and its mission/revision/sequence
  identity exactly matches the Runner plan;
- one invocation manifest maps one candidate to one Runner cycle only.

The existing Feature Flight resolved plan does not currently assign a seat.
The manifest therefore contains `candidateSeatId`; this is routing data, not
authority. It must equal the Runner seat and a named SHIELD specialist. A later
plan schema may own seat routing; this slice does not revise plan schema 1.

## Trusted dependency contract

`trustedDependencies` is a plain closed data object containing only:

- `observeRepository(root)`, returning exact
  `{root,branch,head,clean}`;
- `authorizeRunner(plan)`, an existing Runner V1 authorizer;
- `invokeAdapter(plan, decision)`, the sole adapter call;
- `validateAdapterResult(plan, executorResult)`, a pure Runner V1 validator;
- optional injected snapshot/reserved-output primitives used only by tests.

Every function is snapshotted before the first await. Accessor-backed,
inherited, proxy-backed, missing, or extra dependencies fail before any claim
write or adapter invocation.

The controller counts adapter calls itself. Any second attempted call is a
contract defect and returns recovery-required without making the second call.
Validation is not an adapter invocation and must be pure.

## Durable composition artifacts

All three files are canonical JSON with a trailing newline, closed and
versioned, and live outside every resolved-plan mission worktree and repository
root. The caller pre-creates each as an empty mode-0600 non-symlink regular
file. Parent and target identities are retained before the first write.

### Execute-once claim

`feature-flight-step-claim` schema version 1 contains:

- contract/tool identity;
- deterministic `stepId`, derived from canonical manifest bytes;
- exact manifest, plan, state, and nullable predecessor identities;
- candidate mission/lane/wave and Runner cycle identity;
- adapter/runtime/executor identity;
- expected repository observation;
- `startedAt`;
- `authority:"none"` and an explicit notice that the claim grants no authority.

The claim is written, synced, and read back before authorization or adapter
invocation. Exact replay behavior:

- all three exact artifacts present: validate and return the existing result
  with `replayed:true`, invoking nothing;
- claim present but result or successor absent: return `recovery_required` and
  invoke nothing;
- result/successor without the exact claim, conflicting nonempty bytes, or
  malformed artifacts: return `recovery_required` and invoke nothing;
- three empty reserved outputs: eligible for a first attempt.

Recovery or completion of partial attempts is deferred. This slice only
detects and stops.

### Terminal result receipt

`feature-flight-step-result` schema version 1 contains:

- exact claim identity and `stepId`;
- exact adapter/runtime/executor identity;
- repository observations immediately before claim and immediately after the
  Runner cycle;
- the validated Runner cycle result;
- exact successor bytes/size/digest computed before either terminal write;
- `adapterInvocationCount`, exactly `0` for a pre-effect Runner stop or `1`
  after invocation;
- outcome `completed`, `failed`, or `recovery_required` derived from Runner
  output, never caller supplied;
- `authority:"none"`, `gateEligible:false`, and a non-authoritative notice.

The receipt does not duplicate Runner authorization artifacts, seat-dispatch
receipts, or effect records. It embeds the validated Runner result and binds
its exact canonical digest.

### Successor Feature Flight state

The successor remains `non-authoritative-flight-state` schema version 2 and is
validated by the existing `assertFlightState` plus
`validateImmediateTransition` against the current state.

- `sequence` increments exactly once and `predecessorSha256` equals the exact
  current-state digest;
- tool is exactly `flight-state-successor-recorder@1.0.0`;
- plan, flight, repository, lanes, and unaffected missions remain unchanged;
- on validated Runner `advanced/effect_completed`, the selected mission becomes
  `complete` with revision equal to the post-cycle observed lowercase 40-hex
  repository HEAD;
- on a deterministic executor or validator failure after one invocation, it
  becomes `failed` with the post-cycle observed HEAD;
- authorization wait/deny/stale/malformed, claim failure, executor uncertainty,
  malformed executor/validator output, repository identity drift, or any
  recovery-required condition produces no successor state;
- current wave is recomputed by `currentWaveFor`; lane active mission remains
  null because authority-aware active routing is outside this slice;
- `authorityEvidence` remains null. Completion is observed coordination state,
  not verified authority or acceptance.

The result receipt is durably written and read back first. The successor is
then written and read back. Success is exposed only after both exact readbacks
and an unchanged claim readback.

## Deterministic execution order

1. Snapshot and validate closed inputs/dependencies without host calls.
2. Snapshot plan/state/predecessor and compute status.
3. Require exactly one candidate and no global stop.
4. Validate manifest/candidate/Runner/output-path bindings.
5. Observe exact repository root/branch/HEAD/clean and compare to manifest.
6. Retain all three reserved outputs and classify replay/partial/conflict.
7. Write, sync, and read back the execute-once claim.
8. Run `runRunnerCycle` once:
   - existing authorizer first;
   - claim callback returns claimed only after durable claim readback;
   - adapter callback permits at most one call;
   - pure validator callback follows Runner V1.
9. Observe repository again and reject root/branch ambiguity or malformed HEAD.
10. Derive and validate the result receipt and successor entirely in memory.
11. Write/read back result, then write/read back successor, then re-read claim.
12. Return one closed result projection.

No adapter call occurs before steps 1–7 pass. No false success is returned
after any write/readback/release uncertainty.

## Result projection

Return one closed discriminated result:

- `completed`: one adapter invocation, durable result and successor identities;
- `failed`: one deterministic failed adapter/validation outcome plus durable
  result and failed successor identities;
- `stopped`: Runner stopped before adapter invocation, no terminal artifacts;
- `replayed`: exact terminal artifacts reused, zero invocation;
- `recovery_required`: partial, conflicting, uncertain, or post-effect
  durability/freshness state, never success.

Each result binds `stepId`, exact plan/state/claim/result/successor identities,
Runner reason, adapter invocation count, and deterministic reason code. It
grants no authority and is not human acceptance.

## Files

- Retain this plan.
- Add `packages/shield-team-system/scripts/operations/feature-flight-step.mjs`.
- Update `packages/shield-team-system/scripts/operations/flight-contracts.mjs`
  only for reusable successor construction/validation helpers.
- Add `packages/shield-team-system/tests/operations-feature-flight-step.test.mjs`.
- Update `packages/shield-team-system/tests/package-surface.test.mjs` to prove
  the packed internal operations component is present and loadable.
- Add mirrored `docs/operations/feature-flight-step.md` and
  `packages/shield-team-system/docs/operations/feature-flight-step.md`.
- Update both persisted-artifact contract matrices and the package README.

No existing Runner, dispatch-receipt, governed-May, mission, permission,
authority, or CLI source is modified in this slice.

## Tests and validation

- Happy path writes claim, invokes one adapter, writes result then successor,
  and produces a valid immediate state edge.
- Exact terminal retry invokes no dependency with effects and returns identical
  artifact identities.
- Claim-only, result-only, successor-only, malformed, conflicting, symlinked,
  aliased, non-0600, replaced, partial-write, sync, close, and readback failures
  never invoke or never report success according to their phase.
- Authorization wait/deny/stale/malformed and repository mismatch fail before
  adapter invocation; pre-claim failures leave every output empty.
- Adapter throw, malformed identity, failed, uncertain, duplicate-call attempt,
  and validator failure have exact deterministic classifications.
- Successful and deterministic failed invocations each produce the permitted
  successor status; uncertainty produces no successor.
- Human seat, candidate mismatch, wrong wave, wrong plan/state/predecessor,
  wrong Runner sequence/identity, extra fields, proxies, accessors, sparse
  arrays, BOM/malformed UTF-8, and path overlap fail closed.
- Output paths must be external to repository and every mission worktree,
  distinct after canonicalization and ASCII folding, and precreated mode 0600.
- Focused tests, package surface/pack, full team-system, Multiband tests, build,
  mirrored-doc equality, allowlist check, and `git diff --check` pass.
- Mack validates and Fury reviews the exact implementation revision.

## Exclusions

- No CLI `flight run`, `resume`, or multi-step loop.
- No partial-attempt recovery or lease takeover.
- No remote fetch, push, divergence, ancestry, or reconciliation behavior.
- No review-gate, Mack/Fury automation, human-gate composition, or proving run.
- No new authority class, signed schema, seat-dispatch schema, or journal entry.
- No model-specific adapter, local-model invocation, merge, deployment,
  release, cleanup, or destructive operation.
