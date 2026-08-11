# Issue #225 — bounded Epic Wheels Up contract plan

## Frozen identity

- Repository: `RanSolo/shield-workspace`
- Base: `fc47ccf5b47fc1b340d1ec80a5c025ac7fd04344`
- Issue: `#225`
- Parent: `#224`
- Proving operation: `#271`
- Authority: planning only; implementation remains blocked pending exact Fury
  review and Coulson Wheels Up.

## Objective

Define the smallest host-neutral kernel contract that lets one future Coulson
Epic Wheels Up signature govern a finite Feature Operation without pretending
that future child or integration revisions are already known.

The contract binds a deterministic predicate over future exact state:

`child base = exact current feature head proven by the accepted integration chain`

Every derived child or integration candidate must be a strict subset of the
signed operation plan. The contract grants no effect by itself. Issue #226 owns
the host, journal, CLI, GitHub, and integration execution that may later consume
this contract.

## Repository facts

- `feature-flight-resolved-plan` schema 1 and Flight state schema 2 are
  deliberately authority-none operational prototypes.
- The current controller stops on authority-derived states and cannot prove
  globally current authority.
- Existing schema-9 Wheels Up composes exact current mission authority but
  cannot sign unknown future child revisions.
- Existing review-publication v1 does not bind the PR target branch.
- No integration authority or exact-tree integration receipt exists; #226 owns
  those effects and receipts.

The new contract must not widen, reinterpret, or silently migrate these
existing surfaces.

## New contract

Add `feature.operation.v1` as a host-neutral public Team System contract.

### Plan

`FeatureOperationPlanV1` is closed, content-addressed, and contains:

- contract/schema identity, operation ID, cohesive objective, and optional
  authority-none source provenance;
- repository ID, base branch, exact base revision, and exactly one feature
  integration branch distinct from the base/main branch;
- nonempty accumulated acceptance criteria with stable IDs;
- an ordered, finite child manifest;
- dependency graph and deterministic eligibility order;
- per-child exact bounds for repository, paths, actions, effects,
  capabilities, validations, branch naming, publication policy, required
  Mack/Fury/human review gates, and exclusions;
- feature integration policy with allowed methods and an exact target equal to
  the named feature branch;
- amendment, pause, cancellation, rollback, expiry, and escalation policy;
- finite maximum duration, child count, concurrency, retries, integration
  attempts, captured evidence, and other operation resource bounds;
- fixed final Fitz, conditional Simmons, and Coulson gates;
- fixed exclusions for `main`, `merge_to_main`, deployment, release,
  destructive cleanup, wildcard children, wildcard revisions, and dynamic
  command selection;
- predecessor plan digest for amendments and a deterministic plan digest.

Child identities and bounds are fully known at operation authorization. Future
Git revisions are represented only by the closed current-feature-head predicate,
never nulls, wildcards, model output, or caller discretion.

### Signed operation authority

`FeatureOperationAuthorityV1` binds:

- exact plan and digest;
- Coulson principal, binding, and signing-key references;
- repository, base, feature branch, exact operation sequence, exact journal
  sequence, issuance time, expiry, and finite operation limits;
- authority kind `epic_wheels_up`;
- explicit permitted derivations: feature-branch creation, one draft feature
  workspace PR from the feature branch to the base branch, child initiation,
  child implementation, one child draft PR to the feature branch,
  merge-to-feature integration, and revert-on-feature rollback only;
- explicit prohibited effects: merge-to-main, deployment, release, scope
  expansion, undisclosed children, authority delegation beyond the plan,
  readying or merging the feature workspace PR, and any target other than the
  exact stage target.

`SignedFeatureOperationAuthorityV1` is the closed envelope
`{ payload: FeatureOperationAuthorityV1, signatureBase64 }`. Validation proves
the envelope and payload shape but grants no authority. Verification additionally
requires a closed trusted-binding input and caller-supplied expected operation
ID, operation sequence, and journal sequence. Exactly one active trusted binding
must match seat `coulson`, the payload's principal/binding/signing-key tuple,
mission scope, and issuance sequence; zero, duplicate, stale, revoked, or
conflicting matches fail closed. Verification recomputes the plan and authority
digests and verifies the Ed25519 signature over the framed canonical payload.

The evaluator accepts only a successfully verified signed envelope. An unsigned
authority, a caller boolean claiming verification, or a structurally valid but
unverified signature can never make a candidate eligible. This is a new bounded
authority class, not a blanket epic/repository grant. Authority creation,
signing, durable append, and journal replay remain #226 responsibilities.

### Trusted replay context

`FeatureOperationReplayContextV1` is a closed, immutable projection supplied by
the trusted #226 replay boundary. It contains:

- repository and operation identity plus the active plan, plan digest, verified
  authority identity/digest, accepted authority sequence, and current journal
  sequence;
- ordered accepted plan lineage and accepted amendment digests, with exactly
  one active terminal plan and authority;
- lifecycle state (`active`, `paused`, `cancelled`, `expired`, `integrated`, or
  `superseded`) and the sequence at which that state became current;
- integrated-child inventory and consumed effect-key inventory, each with
  immutable receipt/digest references;
- per-child initiation, implementation, publication, integration, rollback,
  and retry attempt counters plus operation-wide counters;
- host-observed time with `hostTrusted` provenance;
- genesis base head/tree and the latest accepted integration result head/tree,
  where latest equals genesis until the first accepted integration;
- accepted exact-head review evidence inventory, including Mack, Fury, and each
  configured human gate, bound to child, head, repository, and source record.

The context validator requires contiguous lineage, unique sequences/digests,
one genesis, at most one accepted integration successor per prior result, and
latest head/tree equal to the terminal accepted result. No candidate field may
repeat, override, or assert lifecycle, sequence, counters, time, accepted
amendments, consumed effects, integrated children, current feature head/tree,
or accepted evidence observations. Those facts come only from replay context.

### Bounded derivations

The plan represents each permitted effect separately; one derivation cannot be
reinterpreted as another:

- `feature_branch_create`: source is the exact genesis base revision and target
  is the one feature branch;
- `feature_workspace_draft_pr_create`: source is the exact feature branch and
  target is the exact base branch, with draft creation only;
- `child_initiation`: child branch is created from the replay-proven exact
  current feature head;
- `child_implementation`: only the selected child's exact bounded scope on its
  child branch;
- `child_draft_pr_create`: source is the exact child branch and target is the
  exact feature branch, with draft creation only;
- `child_merge_to_feature`: allowed integration method with target exactly the
  feature branch; and
- `child_revert_on_feature`: exact accepted integration receipt to revert, with
  target exactly the feature branch and no history rewrite.

Merge-to-main, child publication to base/main, feature-PR ready or merge,
deployment, release, arbitrary ref updates, and destructive rollback have no
union variant and are therefore unrepresentable.

### Derived candidate proof

`FeatureOperationDerivedCandidateV1` is a stage-discriminated closed union. All
variants bind contract identity, operation/plan/authority digests, child ID when
applicable, requested derivation kind, exact effect key, requested bounded
scope, and candidate digest. The variants are:

- `initiation`: exactly one of feature-branch creation, draft feature-workspace
  PR creation, or child initiation; it carries only the exact source/target or
  child-branch request applicable to that derivation;
- `implementation`: one child, exact replay-derived child base reference,
  exact child branch, and requested implementation scope;
- `child_publication`: one child, exact child branch/head, target feature
  branch, and draft-create-only policy;
- `integration`: one child, exact child branch/head/tree, target feature branch,
  allowed method, predecessor integration receipt reference, and references to
  the exact-head Mack, Fury, and configured human evidence held in replay
  context; and
- `rollback`: one integrated child, exact accepted integration receipt and
  resulting head/tree to revert, target feature branch, and non-destructive
  revert method.

Only `integration` contains review-evidence references. Its references must
resolve to replay-context evidence for the exact candidate child head and all
configured gates. Missing, substituted, stale, or duplicate evidence blocks.
Evidence fields on initiation, implementation, child publication, or rollback
are structurally invalid, so premature or inapplicable evidence cannot be
accepted.

The candidate never carries a claimed current feature head/tree, host time,
lifecycle, sequence, counters, accepted amendment, integrated-child status, or
effect-key availability. The evaluator obtains all such observations from
`FeatureOperationReplayContextV1`, returns only `eligible` or one stable blocked
reason, and does not sign, append, dispatch, publish, merge, revert, or claim
live freshness.

### Deterministic subset and amendment comparison

Candidate scope comparison is dimension-by-dimension and never JSON-shape-only:

1. Contract, repository, operation, active plan, authority, child, and stage
   identities must be exact equal.
2. Actions, effects, capabilities, validations, integration methods, and
   publication operations use canonical unique-set inclusion; candidate sets
   may contain no value absent from the applicable parent child/stage bound.
3. Paths are normalized repository-relative POSIX paths. A candidate path is
   contained only when it equals an allowed path or is its segment-delimited
   descendant; string-prefix matches, `.`/`..`, empty segments, backslashes,
   absolute paths, symlink aliases, and gitlinks are rejected.
4. Base, feature, child, source, and target branches are exact equal to the
   applicable plan predicate. No alias, ref normalization, caller-selected
   destination, or main/base substitution is permitted.
5. Required gates may only stay equal or become stricter, and exclusions may
   only stay equal or grow. Removing/substituting a gate, weakening draft-only
   policy, or removing an exclusion is widening.
6. Every candidate numeric allowance and remaining attempt request must be a
   safe integer greater than or equal to zero and less than or equal to both
   its parent bound and replay-derived remaining bound.
7. Eligibility requires all dimensions to be subsets and at least one
   authority-bearing dimension to be strictly narrower than the operation-wide
   authority; identity metadata and digest fields do not count as narrowing.

`compareFeatureOperationAmendmentV1` returns exactly `identical`,
`pure_narrowing`, or `material`. It compares canonical semantic fields with
digest fields omitted and treats predecessor digest/sequence as lineage rather
than scope. `identical` requires every authority-bearing semantic dimension to
match. `pure_narrowing` requires unchanged repository/operation identity,
child manifest and dependency graph, branch destinations, risk classification,
lineage predecessor, acceptance criteria, derivation kinds, and integration
methods, while at least one existing set/path/numeric/expiry dimension narrows,
no gate or exclusion weakens, and no dimension widens. All other changes are
`material`, including child add/remove/reorder, any dependency-graph change,
base/feature/target destination change, risk or acceptance change, predecessor
or A-B-A lineage change, integration-method change, new derivation/effect/
capability/validation, weaker gate/exclusion, expiry extension, or increased
numeric bound. Material amendments require a fresh Coulson signature.

### Canonical digests and signatures

Plan, authority, and candidate digests use one explicit framing algorithm:

1. validate and clone the closed value;
2. omit only that value's own digest field (`planDigest`, `authorityDigest`, or
   `candidateDigest`), rejecting any other missing or extra field;
3. canonicalize objects by ascending UTF-16 code-unit key order, preserve
   schema-defined array order, and require set-like arrays already sorted by
   the same comparator and unique;
4. encode the ASCII domain `shield.feature-operation.v1`, NUL, the exact kind
   (`plan`, `authority`, or `candidate`), NUL, then the canonical JSON as UTF-8
   without BOM; and
5. SHA-256 the framed bytes and return `sha256:` plus 64 lowercase hexadecimal
   characters.

Signed authority verification uses the separate ASCII domain
`shield.feature-operation.authority.signature.v1`, NUL, followed by canonical
UTF-8 JSON of the complete authority payload including its verified digest.
No locale, host serialization, Unicode normalization, timestamp parsing side
effect, or caller-provided digest bytes participate.

Blocked-reason precedence is fixed and tested in this order:

1. `PLAN_INVALID`
2. `SIGNED_AUTHORITY_INVALID`
3. `TRUSTED_COULSON_BINDING_INVALID`
4. `AUTHORITY_SIGNATURE_INVALID`
5. `REPLAY_CONTEXT_INVALID`
6. `IDENTITY_OR_DIGEST_MISMATCH`
7. `AUTHORITY_OR_LINEAGE_INACTIVE`
8. `LIFECYCLE_BLOCKED`
9. `SEQUENCE_MISMATCH`
10. `AUTHORITY_EXPIRED`
11. `CANDIDATE_INVALID`
12. `STAGE_OR_EVIDENCE_INAPPLICABLE`
13. `CHILD_OR_DEPENDENCY_INELIGIBLE`
14. `FEATURE_OR_CHILD_REVISION_STALE`
15. `SCOPE_NOT_STRICT_SUBSET`
16. `BRANCH_TARGET_OR_METHOD_INVALID`
17. `INTEGRATION_EVIDENCE_INVALID`
18. `BOUNDS_EXHAUSTED`
19. `EFFECT_KEY_REUSED`

The evaluator checks every class but returns the first applicable reason in
that order, independent of object insertion order.

## Required APIs

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

Every API accepts closed ordinary data, clones/freeze-normalizes output, uses
locale-independent canonical ordering, and rejects accessors, proxies,
symbols, inherited/non-enumerable data, sparse arrays, duplicates, unknown
fields, unsafe integers, and non-canonical identities.

## Amendment semantics

An amendment creates a successor plan linked to the immediately active prior
digest and never rewrites prior evidence. The comparison algorithm above is the
sole classifier. Pure narrowing still requires accepted lineage recording and
cannot reactivate cancelled, expired, integrated, or superseded authority.

## Exact implementation scope

Writable paths:

- `packages/shield-team-system/src/feature-operation-v1.mts`
- `packages/shield-team-system/public/feature-operation.mjs`
- `packages/shield-team-system/public/feature-operation.d.mts`
- `packages/shield-team-system/package.json`
- `packages/shield-team-system/PUBLIC_API.md`
- `packages/shield-team-system/tests/feature-operation-v1.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `docs/operations/feature-operation-plan.md`
- `packages/shield-team-system/docs/operations/feature-operation-plan.md`
- `docs/operations/persisted-artifact-contract-matrix.md`
- `packages/shield-team-system/docs/operations/persisted-artifact-contract-matrix.md`
- this plan artifact.

Forbidden paths include mission journals/CLI/signers, `mission-v2.mts`,
schema-9 permission/implementation authority, existing Flight controller/step/
run/recovery code, GitHub adapters, and Multiband.

The new subpath export is `@shield/team-system/feature-operation`. The supported
installation remains one exact `@shield/team-system` package artifact.

## Acceptance tests

Prove:

1. exact valid genesis plan, signed authority, replay context, every candidate
   stage, canonical digest, and independent Ed25519 signature vectors;
2. zero/duplicate/stale/conflicting Coulson bindings, wrong operation/journal
   sequence, unsigned authority, and bad signature fail before eligibility;
3. trusted replay context proves active lineage, exact genesis/latest accepted
   head/tree, counters, lifecycle, time, integrated children, effect inventory,
   and accepted review evidence without accepting candidate assertions;
4. feature branch, feature workspace draft PR, child initiation,
   implementation, child draft PR, merge-to-feature, and revert-on-feature are
   separate derivations with exact sources and targets;
5. every stage rejects fields from another stage, and only integration accepts
   exact-child-head Mack/Fury/configured-human evidence references;
6. canonical set inclusion, segment-delimited path containment, exact branches,
   no-weaker gates/exclusions, safe numeric bounds, and a genuinely strict
   dimension are proven independently;
7. identical, pure-narrowing, and material amendment vectors cover child and
   graph changes, destination/method/risk/acceptance/lineage changes, scope and
   effect widening, weaker gates, expiry extension, and increased bounds;
8. digest framing has fixed cross-process vectors and excludes exactly the own
   digest field; candidate validation/digest and blocked-reason precedence are
   stable under multi-fault and insertion-order cases;
9. stale base/head, wrong tree, missing/duplicate predecessor, exceeded limits,
   expiry, pause/cancellation/supersession/integration, A-B-A plan reuse, and
   effect-key reuse fail closed;
10. wildcard/deferred revision placeholders, dynamic commands, child/main
    target substitution, feature PR ready/merge, deploy/release, and blanket
    repository authority are unrepresentable;
11. hostile object/array/JSON-equivalent structures fail closed; and
12. existing Flight, schema-9, publication, package, and installation vectors
    remain unchanged.

## Validation

```text
npx nx build @shield/team-system
node --test packages/shield-team-system/tests/feature-operation-v1.test.mjs
node --test packages/shield-team-system/tests/package-surface.test.mjs
node --test packages/shield-team-system/tests/operations-feature-flight-controller.test.mjs
npx nx test @shield/team-system
npm pack --workspace @shield/team-system --dry-run
git diff --check
```

## Stop boundary

Stop with the pure contract, tests, mirrored documentation, and package export.
Do not create the feature branch, sign Epic Wheels Up, append journals, derive a
production authority record, invoke a model, publish, integrate, merge, deploy,
release, or begin #226.
