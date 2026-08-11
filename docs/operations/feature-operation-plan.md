# Feature Operation v1

`feature.operation.v1` is the pure, host-neutral contract for a finite Epic
Wheels Up operation. It lets a Coulson signature authorize deterministic
predicates over future child revisions without treating unknown revisions as
wildcards. The module validates and evaluates ordinary data only. It does not
sign, append a journal, dispatch, publish, create branches or pull requests,
integrate, revert, merge to main, deploy, or release.

## Public surface

Import the contract from `@shield/team-system/feature-operation`. The surface
exports schema, authority-kind, derivation, exclusion, prohibited-effect, and
blocked-reason constants plus these APIs:

- `validateFeatureOperationPlanV1`
- `computeFeatureOperationPlanDigestV1`
- `validateFeatureOperationAuthorityV1`
- `computeFeatureOperationAuthorityDigestV1`
- `validateSignedFeatureOperationAuthorityV1`
- `verifySignedFeatureOperationAuthorityV1`
- `validateFeatureOperationReplayContextV1`
- `validateFeatureOperationDerivedCandidateV1`
- `computeFeatureOperationDerivedCandidateDigestV1`
- `compareFeatureOperationAmendmentV1`
- `evaluateFeatureOperationDerivedCandidateV1`

Validation returns a frozen defensive copy or a closed invalid result. Digest
functions throw `TypeError` for malformed values. Evaluation returns only
`eligible` with the replay-derived terminal feature head/tree, or `blocked`
with one stable reason. It performs no effect.

## Closed plan and authority

A plan binds the operation, objective, optional authority-none provenance,
repository, base branch/revision/tree, one distinct feature branch, ordered
acceptance criteria, ordered finite children and dependency order, integration
policy, lifecycle policy, finite limits, fixed final gates and exclusions,
expiry, sequence, predecessor digest, and its own digest.

Each child binds one exact branch and repository, risk and acceptance criteria,
dependencies, derivation kinds, allowed repository-relative paths, actions,
effect keys, capabilities, validations and publication operations, required
Mack/Fury/configured-human gates, exclusions, and finite attempt/retry limits.
Set-like arrays are canonical UTF-16 code-unit sorted and unique. Paths reject
absolute paths, backslashes, empty segments, `.`, and `..`; containment is
segment-delimited.

Genesis plans use sequence zero and a null predecessor. An amendment is only
comparable when it is the next sequence and names the exact active predecessor
digest. A pure narrowing may reduce existing sets, paths, numeric limits, or
expiry and may strengthen gates/exclusions, while preserving children,
dependencies, destinations, risks, acceptance criteria, derivations, and
integration methods. Every other valid successor is material. Every successor
still requires fresh signed authority; comparison never activates it.

Repository revisions are exact lowercase 40-hex Git object IDs. Tree and
record identities use `sha256:` digests; those digest forms are never accepted
as deferred Git revisions. Plan exclusions must include the fixed exclusions
and may only grow on a narrowing amendment. Child and candidate scopes reject
the fixed prohibited effect tokens.

The authority embeds the exact plan and binds its digest, operation/repository
identity, base and feature branches, operation and journal sequence, issuance
and expiry, exact finite limits, the seven permitted derivations, the fixed
prohibited effects, Coulson principal/binding/key references, and its own
digest. The only authority kind is `epic_wheels_up`.
The authority operation sequence is an independent replay-bound operation
sequence, not an alias for the plan-amendment sequence.

The signed envelope is exactly `{ payload, signatureBase64 }`. Verification
requires caller-supplied expected mission, operation, operation sequence, and
journal sequence plus a closed trusted-binding list. Exactly one active
`coulson` binding must match the principal, binding, signing key, mission
scope, and issuance sequence. Verification recomputes digests and verifies
Ed25519 over the framed canonical payload.

## Trusted replay

Replay context is a closed projection from the future trusted host boundary. It
contains the exact active plan and authority identities, contiguous plan
lineage, accepted amendment digests, lifecycle, host-trusted time, counters,
consumed effects, accepted exact-head review evidence, and an ordered feature
transition chain.

The chain starts with exactly one genesis transition at operation sequence zero.
Every later transition increments by one, uses globally unique effect and
receipt identities, and starts at the prior transition's resulting head/tree.
Integration transitions bind a known child and its exact head/tree. Rollback
may reference only the latest unreverted integration and must restore that
integration's prior tree through a new observed revert commit. Separate
append-only integration and rollback histories must exactly equal the chain;
rollback marks history reverted but never deletes it.

The authoritative current feature state is only the terminal transition's
resulting head/tree. Candidates cannot assert lifecycle, time, sequence,
counters, history, consumed effects, accepted evidence, or current feature
state.

## Derived candidates

The closed stage union represents only:

| Stage | Derivation | Exact target predicate |
| --- | --- | --- |
| initiation | `feature_branch_create` | authorized base revision to feature branch |
| initiation | `feature_workspace_draft_pr_create` | feature branch to base branch, draft create only |
| initiation | `child_initiation` | replay terminal feature head to exact child branch |
| implementation | `child_implementation` | replay terminal feature head on exact child branch and bounded scope |
| child_publication | `child_draft_pr_create` | exact child branch/head to feature branch, draft create only |
| integration | `child_merge_to_feature` | exact child head/tree to feature branch by an allowed method |
| rollback | `child_revert_on_feature` | latest unreverted integration to feature branch by revert commit, restoring its prior tree |

Every candidate binds repository and operation identity, plan and authority
digests, one unique effect key present in its requested bounded scope,
stage-specific fields, and its own digest. Only
integration carries review-evidence references. Those references must resolve
exactly once to Mack, Fury, and every configured human gate for the exact child
head and repository.

## Digests, signatures, and precedence

Plan, authority, and candidate digests remove only their own digest field, sort
object keys by UTF-16 code units, preserve schema-ordered arrays, and hash:

`shield.feature-operation.v1 NUL <kind> NUL <canonical UTF-8 JSON>`

The digest is `sha256:` followed by 64 lowercase hexadecimal characters.
Authority signatures cover:

`shield.feature-operation.authority.signature.v1 NUL <complete canonical authority payload>`

Blocked evaluation follows the exported 19-code order, from `PLAN_INVALID`
through `EFFECT_KEY_REUSED`. Multi-fault input therefore has deterministic
results independent of object insertion order.

## Compatibility boundary

This contract is additive. It does not widen or reinterpret Feature Flight
schema 1, Flight state schema 2, schema-9 implementation authority, review
publication v1, existing GitHub adapters, or any durable journal. Host effects,
authority creation, signing, append/replay, integration receipts, rollback
execution, and live freshness belong to a separately reviewed implementation.
