# Feature Flight one-cycle step

`runFeatureFlightStepV1` is an internal packaged operations seam for one
already-active, dependency-free Daisy coordination cycle. It is not a CLI or a
public package export.

The caller provides exact Feature Flight plan/current/predecessor paths,
digests, current sequence, `maxSteps:1`, and a closed flight/mission routing
hint. Trusted host dependencies provide schema-9 Runner input replay,
authorization, the fixed read-only Daisy adapter, pure result validation,
repository observation, host-observed adapter/runtime/executor identity, an
external mode-0700 claim-store root, and a canonical millisecond clock.

Before any claim or adapter call, the controller replays the existing
`authority-verification-required` structural boundary, validates the trusted
Runner projection and fixed Daisy policy, selects one sole active mission with
no dependencies, and verifies its worktree, branch, revision, and clean state.
May, Mack, Fury, human seats, non-coordination effects, and alternate adapter,
action, or validation identities are rejected before effects.

## Execute-once store

The invariant `effectClaimId` names
`<claimStoreRoot>/effects/<effectClaimId>`. The trusted root must already be a
canonical non-symlink mode-0700 directory outside the repository and every plan
worktree. The first caller exclusively creates the effect directory and a
create-only mode-0600 `claim.json`; an existing directory can never invoke the
adapter again.

Artifacts are canonical JSON with a trailing newline and are written in this
order:

1. `claim.json` — durable execute-once claim and exact attempt evidence;
2. `successor.json` — legal Feature Flight `active -> complete` state;
3. `result.json` — terminal receipt binding the claim, successor, validated
   Runner advanced result, identical before/after repository observations, and
   host-observed adapter identities.

Each write is create-only, synced, parent-synced, and exactly read back. A
claim-only or successor-only directory, malformed bytes, conflicting attempt,
or durability/readback uncertainty returns `recovery_required`; this slice has
no interruption-recovery or takeover behavior.

## Result boundary

The closed projections are `completed`, `replayed`, `stopped`, and
`recovery_required`. Only an exact final claim/successor/result readback returns
`completed`. Exact terminal retry returns `replayed` with no authorization,
adapter, or write call. Pre-claim Runner stops return `stopped`; every stop or
uncertainty after the claim boundary returns `recovery_required` unless an
exact terminal triad can be replayed.

Terminal evidence records
`effectContainment:"external_uncertain_repository_unchanged"`,
`gateEligible:false`, and `authority:"none"`. It proves only that the selected
repository readback did not change; it does not establish external-effect
containment, human acceptance, implementation authority, review-gate passage,
or proving-flight status.
