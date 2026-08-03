# Schema-9 Wheels Up and runtime-binding producer — exact implementation plan

## Gate identity

- Parent: issue #171 Slice C prerequisite
- Mission: `mission:issue-171-slice-c-prerequisite`
- Mission revision: `sha256:14pmqgHwaF6y_VdD5laf6zpQpYQHQTqwjfjlSAhRNW0`
- Base revision: `d5657ea2c59759b8494fb679bc82e0c47756e90f`
- Child issue: #181 — Schema 9: produce signed Wheels Up authority and May
  runtime-binding supersession
- Status: planning only; no implementation authority

## Frozen objective

Add the canonical schema-9 positive Wheels Up authority producer and active
runtime-binding lifecycle needed upstream of issue #171 Slice C. Keep the
authority, binding, and supersession records in the profile-aware schema-9
journal so downstream code consumes replayed state rather than a second store or
caller assertion.

## Contract decisions

1. Add a dedicated closed `ImplementationAuthorityV1` contract. It binds one
   Coulson-authorized Wheels Up grant to mission, subject, repository, canonical
   writable root, branch, mission revision, artifact/base/head revisions, May
   seat participation, approved relative paths, action IDs, effect classes,
   capabilities, validation-command IDs, lifecycle, and journal sequence.
2. Add a Coulson-signed authorization envelope and verifier for that exact
   authority. Its only positive kind is `wheels_up`; withheld authority remains
   absence. It is not mission authorization, Wheels Off, review publication, or
   final acceptance.
3. Extend `ProfileAwareMissionEntryV1` with three schema-9 entries:
   `implementation.authorized`, `runtime.binding_recorded`, and
   `runtime.binding_superseded`.
4. Extend `ProfileAwareProjectionV1` with the replayed implementation authority,
   all runtime-binding versions, and exactly the active bindings. Replay is the
   sole canonical producer of these projections.
5. Reuse `RuntimeBinding`, `computeRuntimeBindingDigest`, and the signed
   initial/supersession invariants already proven for schemas 6–8. Extract shared
   pure validation only where required; do not route schema 9 through
   `replaySupervisedMissionJournal`, mutate legacy behavior, or create a parallel
   binding store.
6. A schema-9 May binding is valid only when its `coulsonAuthorizationRef`
   identifies the active exact Wheels Up record and its repository, root, branch,
   revisions, seat, and approved scope are equal to or narrower than that record.
7. Supersession requires exactly one active prior binding with the same binding
   ID and May seat, version incremented by one, explicit prior ID/version in the
   signed payload, and atomic projection of the prior version as superseded.
   Runtime/model or executor changes therefore require a signed supersession.
8. `review-publication.v1` stays unchanged. Its `wheels_up` discriminator remains
   bounded review-publication authority and is not accepted as implementation
   authority.

## Bounded path set

- Add `packages/shield-team-system/src/implementation-authority-v1.mts` for the
  closed authority shape, canonical digest, strict validator, and signed Coulson
  verifier.
- Update `packages/shield-team-system/src/profile-aware-mission-v1.mts` for the
  three entry constructors, schema-9 replay, projection state, ordering, scope
  narrowing, lifecycle, and supersession.
- Update `packages/shield-team-system/src/mission-v2.mts` only if needed to
  export shared runtime-binding authorization validation/digest helpers without
  changing schemas 2–8 behavior.
- Update `packages/shield-team-system/package.json` and
  `packages/shield-team-system/tests/package-surface.test.mjs` with one explicit
  `./implementation-authority` export for the new contract.
- Add focused tests in a new
  `packages/shield-team-system/tests/schema9-implementation-authority.test.mjs`
  and extend `profile-aware-mission-v1.test.mjs` only for integration replay
  cases.

No mission runtime, permission-audit store, May control-event store, CLI,
dispatch, local-model adapter, issue #170, issue #141, or review-publication code
is in the path set.

## Failure precedence

Constructors and replay fail closed in this order:

1. malformed or unsupported entry/contract shape;
2. mission, subject, participant, or trusted-human mismatch;
3. stale mission/artifact/repository/root/branch identity;
4. invalid signature, signer binding, or sequence;
5. missing, duplicate, inactive, or ambiguous Wheels Up authority;
6. binding scope wider than Wheels Up authority;
7. missing, duplicate, inactive, stale, or ambiguous prior binding;
8. invalid binding version, runtime/executor identity, or supersession transition;
9. mixed-schema or legacy-to-schema-9 substitution.

## Acceptance tests

- A valid signed schema-9 Wheels Up record replays as the one active
  implementation authority with its exact digest and evidence reference.
- Missing, malformed, forged, wrong-signer, stale-revision, wrong-sequence,
  duplicate, and conflicting authority records fail closed.
- Governance approval, Wheels Off, review publication (including its
  `wheels_up` kind), Fury evidence, host assertions, and caller prose cannot
  produce implementation authority.
- A valid initial May binding replays active only when exact-bound to the current
  Wheels Up authority; overbroad path, action, effect, capability, validation,
  repository, root, branch, revision, runtime, executor, or seat values fail.
- Valid supersession closes the prior binding and activates exactly version N+1;
  skipped versions, wrong prior identity, duplicate active bindings, runtime or
  executor substitution without supersession, stale authorization, and replay
  reordering fail closed.
- Schema-6-through-8 constructor/replay behavior remains byte-for-byte and
  semantically unchanged; schema-9 records cannot enter the supervised replay
  path and legacy records cannot enter profile-aware replay.
- Replay is deterministic across restart and returns copies that cannot mutate
  authoritative state.

## Validation commands

Use the package-owned toolchain and do not mask failures:

```bash
npm run build --workspace packages/shield-team-system
node --test packages/shield-team-system/tests/schema9-implementation-authority.test.mjs
node --test packages/shield-team-system/tests/profile-aware-mission-v1.test.mjs
npm test --workspace packages/shield-team-system
```

## Explicit stop

Stop after the child implementation reaches its own exact Fury-reviewed plan.
Do not implement this plan under the prerequisite mission. Do not enter issue
#171 Slice C or #170, invoke May or a local model, construct a production
permission context, publish a dispatch command, merge, deploy, release, or run
external effects.
