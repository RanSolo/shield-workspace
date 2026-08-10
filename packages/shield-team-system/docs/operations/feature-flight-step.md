# Feature Flight one-cycle step

`runFeatureFlightStepV1` remains the internal, non-CLI seam for one active,
dependency-free Daisy coordination cycle. Persisted claim/result/recovery and
terminal artifacts use contract `2.0.0`; exact `1.0.0` terminal triads are
read-only legacy inputs.

The controller first validates and snapshots its closed caller and trusted
dependencies. It then replays only deterministic plan, state, predecessor, and
Runner-input evidence needed to derive the stable `effectClaimId`. Store
classification follows before repository observation, remote observation,
Runner authorization/claim, result validation, or adapter invocation. Exact
v2 winners may materialize declared absent files; malformed, unsupported,
conflicting, and incomplete-v1 stores are not changed.

## Read-only remote gate

The host injects a separately frozen descriptor for
`shield.feature-flight.remote-observer@1.0.0`. It binds distinct runtime and
executor identities, the selected worktree, canonical common-Git directory and
device/inode, fixed `origin`, configured origin URL, and normalized SSH remote
identity. The controller derives `refs/heads/<mission.branch>` and a distinct
challenge for `pre_claim` and `post_adapter`.

Only an absent remote branch or a head equal to local HEAD passes pre-claim.
After one completed adapter call, local identity must remain exact and the
second remote observation must preserve every identity, head, and monotonic
timestamp. Any post-claim failure or drift elects recovery; neither the core
nor its dependency surface contains Git/network mutation authority.

## Execute-once terminal protocol

The external mode-0700 store retains
`effects/<effectClaimId>` as a three-level inode-bound hierarchy. All artifacts
are canonical mode-0600 JSON, create-only, synced, parent-synced, and read back.

1. `claim.json` records exact local evidence, the observer descriptor, and the
   pre-claim observation.
2. `terminal.json` is the sole `O_EXCL` arbiter. Its winner is `success` or
   `recovery` and embeds complete canonical payloads plus byte lengths and
   SHA-256 identities.
3. A success winner may materialize only absent `successor.json` and
   `result.json`; a recovery winner may materialize only absent
   `recovery.json` and requires a null successor identity.

A present partial, malformed, or wrong target is never deleted, truncated,
replaced, or repaired. A retry after any durable claim never authorizes or
invokes the adapter again. Recovery handoffs use only
`inspect_claim_and_remote_non_destructively`; there is no takeover, automatic
reconciliation, review gate, proving flight, or CLI surface.

Every projection and artifact remains `authority:"none"` and
`gateEligible:false`. Successful evidence retains
`effectContainment:"external_uncertain_repository_unchanged"` and is not human
acceptance or implementation authority.
