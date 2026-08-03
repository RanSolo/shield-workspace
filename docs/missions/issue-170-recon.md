# Issue #170 reconnaissance

## Identity

- Mission: `mission:issue-170`
- Authorized mission revision: `sha256:qlJv8-RdF7lYLTZx09nQQ485jrtLzjF0a4LVWw9mujY`
- Exact repository base: `f05b92f4f4ad7535d60289a5d2cde2493fbfd820`
- Branch: `agent/issue-170`
- Mode: Delivery

## Observed facts

- Implementation discovery at `4370004ecc7d5406367a9558acdb363dee8828c9`:
  `evaluateFuryPlanReviewEvidenceV1` requires raw receipt events for independent
  attribution, while every exported restart-safe receipt reader exposed only
  projections. Fury confirmed there was no valid existing composition and
  required one read-only validated raw-ledger API as the smallest correction.
- Implementation discovery at `013f9dfabe5c188b7443c15d6968e1ddd4054aa3`:
  the frozen certified Helicarrier `compilation-manifest.v0` carries compilation
  digests and byte lengths, not authority subsets. Fury confirmed a plan-only
  correction: validate the closed derived envelope/IR before Helicarrier, then
  verify only the manifest fields the frozen compiler actually emits.

1. The original mission remains active in the primary durable journal. It is
   supervised/authorized and running. This run resumes that mission; it does
   not create a second `mission:issue-170` identity.
2. All prerequisites named in the original dependency-gated May blueprint are
   now present on `main`:
   - schema-9 Wheels Up authority and May runtime-binding lifecycle;
   - live schema-9 permission-context loading;
   - durable Fury plan-review evidence with attributed receipt validation;
   - atomic seat-dispatch packet claim;
   - durable permission-audit and May control-event stores.
3. The missing product seam is composition. No supported public function
   currently performs the closed sequence from durable mission/Fury evidence
   through exact readiness, packet claim, mission-cycle execution, May control,
   and durable terminal evidence.
4. `runMissionCycle` already owns the permission decision, runtime invocation
   claim, fresh permission rechecks, one-cycle runner, result validation, and
   mission-journal effect append/readback. Issue #170 must compose it rather
   than recreate those semantics.
5. `claimSeatDispatchPacketV1` is the durable outer packet linearization point.
   An exact prior start is non-executable. A prior start without exact terminal
   evidence requires recovery; it is not a successful idempotent replay.
6. `evaluateFuryPlanReviewEvidenceV1` can admit only independently attributed,
   durable, exact-bound Fury evidence. The effectful Delivery Workspace
   publication helper is not needed in the execution coordinator; current PR
   state must be supplied through a trusted read-only host observation and
   exact-matched to the durable evidence.
7. `loadSchema9PermissionContextV1` derives runtime, model, executor, root,
   branch, revision, scope, approved relative paths, validation IDs, and live
   capability evidence from replayed authority/binding plus host observation.
   Caller prose cannot supply or override those values.
8. `runHelicarrierV0` is an internal certified kernel. Its validator/compiler
   dependencies remain host-supplied. The coordinator may invoke that kernel
   with snapshotted trusted dependencies, but must not expose the kernel as a
   second public dispatcher or claim to certify caller-provided compiler code.
9. PR #168 is already merged at `b69934febe71d13b41a3db2ba28dd17e57cbd342`.
   Therefore #170 cannot truthfully advance that PR. The bounded #137 proof can
   only replay its approved three-path packet in a disposable local checkout
   and stop at the post-implementation review gate. It cannot complete #137's
   fresh-external-repository acceptance criterion or enter #29.

## Corrected specialist findings

- Daisy correctly found the missing coordinator and existing public seams.
  Internal `dist` paths and the Helicarrier kernel are implementation details,
  not new consumer imports.
- May correctly identified the durable packet claim as the first outer
  pre-effect write and the cross-store recovery problem. Hill rejected two
  unsupported suggestions: no `parseCanonicalPacket` helper exists, and
  `already_claimed` is not automatically a successful replay.

## Remaining design risk

The stores cannot be atomically committed under one global lock. Correctness
must therefore come from strict ordering, exact readback, immutable identities,
fresh pre-effect revalidation, explicit terminal receipts, and a closed
`recovery_required` result after any uncertain write. The implementation must
not promise transactionality that the existing contracts do not provide.
