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
- Coulson principal/binding/signing-key references;
- repository, base, feature branch, issuance sequence/time, expiry, and finite
  operation limits;
- authority kind `epic_wheels_up`;
- explicit permitted derivations: child initiation, implementation,
  target-bound draft publication, and merge-to-feature integration only;
- explicit prohibited effects: merge-to-main, deployment, release, scope
  expansion, undisclosed children, and authority delegation beyond the plan.

This is a new bounded authority class, not a blanket epic/repository grant.
The signature and journal producer are outside this slice.

### Derived candidate proof

`FeatureOperationDerivedCandidateV1` binds:

- parent plan/authority identities and digests;
- exact child definition and its strict-subset scope;
- exact prior feature head/tree;
- exact current feature head/tree observation;
- predecessor integration-receipt digest or genesis base proof;
- exact child base/head when known;
- exact child branch and target feature branch;
- requested derivation kind and effect key;
- required Mack, Fury, and human review evidence references;
- current operation sequence, remaining bounds, and expiry observation;
- deterministic candidate digest.

The pure evaluator returns only `eligible` or one stable blocked reason. It
does not sign, append, dispatch, publish, merge, or claim live freshness.

## Required APIs

- `validateFeatureOperationPlanV1`
- `computeFeatureOperationPlanDigestV1`
- `validateFeatureOperationAuthorityV1`
- `computeFeatureOperationAuthorityDigestV1`
- `compareFeatureOperationAmendmentV1`
- `evaluateFeatureOperationDerivedCandidateV1`

Every API accepts closed ordinary data, clones/freeze-normalizes output, uses
locale-independent canonical ordering, and rejects accessors, proxies,
symbols, inherited/non-enumerable data, sparse arrays, duplicates, unknown
fields, unsafe integers, and non-canonical identities.

## Amendment semantics

An amendment creates a successor plan linked to the prior digest and never
rewrites prior evidence. Added children, acceptance/scope/risk/effect widening,
destination or integration-method changes, expiry extension, or increased
bounds are material and require a fresh Coulson decision. Pure narrowing may be
classified separately but cannot reactivate cancelled, expired, integrated, or
superseded authority.

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

1. exact valid genesis plan/authority/candidate vectors and stable digests;
2. child dependencies, deterministic eligibility, and strict-subset scope;
3. exact current-feature-head genesis and predecessor-receipt predicates;
4. target branch fixed to the one feature branch and never main/base aliases;
5. required Mack/Fury/human gate references cannot be omitted or substituted;
6. added child, scope/acceptance/risk/effect widening, destination substitution,
   expiry extension, and increased bounds are material amendments;
7. stale base/head, wrong tree, missing/duplicate predecessor, exceeded limits,
   expiry, cancellation, supersession, A-B-A plan reuse, and effect-key reuse
   fail closed;
8. wildcard/deferred revision placeholders, dynamic commands, deploy/release,
   merge-to-main, and blanket repository authority are unrepresentable;
9. hostile object/array/JSON-equivalent structures fail closed;
10. existing Flight, schema-9, publication, package, and installation vectors
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

