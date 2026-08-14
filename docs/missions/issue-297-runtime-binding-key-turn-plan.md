# Issue #297 — turnkey runtime-binding key turn

## Exact mission identity

- Parent: GitHub issue `#268`
- Child: GitHub issue `#297`
- Repository: `RanSolo/shield-workspace`
- Planning base: `3d3b80cdebe8b6e9858a27ffbdbe8090688ebbd1`
- Mission: `mission:issue-297`
- Authority during planning: none

## Objective

Add the smallest B2 adapter to the accepted reviewed-transition and
`shield mission prepare-next` boundary. When a graph-backed schema-9 mission
already has current signed mission authorization and one active Wheels Up
implementation authority but no May runtime binding, deterministic software
derives the exact initial binding from the reviewed plan and live authority,
preflights it, presents one bounded decision, accepts one PIN, and appends one
existing `runtime.binding_recorded` entry.

Hill supplies only mission ID and repository root. No binding JSON, identity,
sequence, authorization ID, repository fact, or command is caller-authored.

## Scope correction

This slice does **not** implement runtime-binding supersession. The protected
reviewed-transition store currently materializes one immutable graph per
mission and rejects a different graph as `materialization_conflict`. A runtime
switch requires a separately reviewed successor-intent lineage and must not be
smuggled through the initial graph. Existing schema-9 supersession producers
and replay tests remain unchanged and green. A later child may add a versioned
reviewed-transition lineage before exposing a turnkey runtime switch.

## Observed boundary

`mission bind --input` already constructs, signs, freshness-checks, and appends
the initial May binding, but it requires hand-authored JSON. `prepare-next`
currently handles fresh atomic Wheels Up, exact initial retry, prepared
publication, and exact publication retry. An authorized mission with an active
implementation authority and no runtime binding is treated as a partial
authority conflict even when the reviewed plan supplies the exact runtime,
model, and executor identities.

## Frozen design

### 1. Closed initial-binding transition

Extend the authority-none preparation contracts with one additive transition
variant for `initial_runtime_binding`. Its reviewed decisions are limited to:

- exact mission, subject, repository, planning base, and reviewed-plan identity;
- May as the adapter-fixed seat;
- reviewed model, reasoning-runtime, and tool-executor identities;
- unchanged exclusions.

The host derives all current facts: repository root, branch, HEAD, mission
revision, journal sequence and digest, active implementation authority and
digest, signer binding, binding ID/version, approved scope, paths, validation
commands, and remaining gates. The preparation library remains authority-none
and receives only a closed observation projection.

The transition is ready only when:

- the protected graph and Fury attribution remain exact and production-eligible;
- schema 9 mission authorization is current;
- exactly one active Wheels Up authority matches repository, root, branch,
  HEAD, plan base, plan model, approved paths/actions/effects/capabilities, and
  validation commands;
- execution is `not-started` and final acceptance is waiting;
- no historical or active May runtime binding exists;
- the signer binding is unique and current;
- May, model, runtime, and executor identities are mutually distinct and no
  runtime/model/executor identity is a mission participant.

Malformed, stale, dirty, ambiguous, conflicting, already-superseded, or
unsupported states return one stable reason before decision rendering or PIN
access. Selection priority remains exhaustive and preserves all existing A1/B1
results.

### 2. Shared initial-binding executor

Extract the existing effectful body of `mission bind` into one package-internal
`runtime-binding-executor-v1.mts` used by both:

- legacy `mission bind --input ...`; and
- the prepared initial-binding branch of `mission prepare-next`.

The executor has explicit `legacy` and `prepared` modes and bounded injectable
dependencies for rendering, passcode input, signing, and atomic append.
Legacy mode preserves the existing input, IDs, source reference, output, and
failure behavior. Prepared mode accepts only the exact host-produced candidate
and revalidates the protected graph, Fury attribution, configuration, journal,
signer, implementation authority, and repository observation before display,
after PIN, and before append.

Both modes reuse:

- `validateSchema9RuntimeBindingV1`;
- `validateSchema9RuntimeBindingAuthorizationPayload`;
- `createProfileAwareRuntimeBindingRecordedEntryV1`;
- `signMissionPayload`;
- `appendProfileAwareMissionEntriesAtomicV1` with one entry and the exact
  starting journal SHA-256.

Prepared identity formulas remain deterministic:

- binding ID: `binding:${missionId}:may:1`;
- binding version: `1`;
- authorization ID: `authorization:runtime-binding:${sequence}`;
- source: `cli:prepare-next:runtime-binding:${sequence}`.

No GitHub, model, dispatch, publication, merge, deployment, or release effect
is permitted.

### 3. Exact retry

When exactly one signed initial binding already matches the recomputed semantic
tuple—mission/subject/revision, May seat, implementation authority, repository,
root/branch/HEAD, model/runtime/executor, approved scope, paths, validation
commands, binding ID/version, and prepared provenance—return
`runtime_binding_already_authorized` and:

`ALREADY AUTHORIZED — nothing repeated.`

The retry reads no passcode, signs nothing, appends nothing, and preserves exact
journal bytes. A different runtime, model, executor, authority, HEAD, scope, or
legacy/unproven binding is not an exact retry and fails closed. It is not
silently treated as supersession.

## Acceptance mapping and packets

### Packet P1 — AC-1: deterministic selection

- Extend the authority-none contract/compiler union and focused tests.
- Extend the host resolver with `runtime_binding_ready` and stable pre-PIN
  failure precedence.
- Expected pre-implementation failure: `missing_behavior`.
- Successor: P2.

### Packet P2 — AC-2: one key turn

- Add the shared initial-binding executor.
- Route legacy bind and prepared `prepare-next` through it.
- Prove one decision, one signer call, one existing entry, post-PIN freshness,
  cancellation, and legacy compatibility.
- Expected pre-implementation failure: `missing_behavior`.
- Successor: P3.

### Packet P3 — AC-3: harmless retry and boundaries

- Prove fresh-process exact retry preserves bytes and never prompts.
- Prove changed identity/authority/HEAD/scope cannot reuse the binding.
- Prove supersession remains unsupported by this dispatcher and existing
  supersession contract tests remain green.
- Expected pre-implementation failure: `missing_behavior`.
- Successor: Mack exact-revision validation, then Fury conformance.

Each packet is a rapid strike inside this one mission and one Wheels Up phase;
packet completion is not a new mission or PIN gate.

## Writable paths

- `docs/missions/issue-297-runtime-binding-key-turn-plan.md`
- `packages/mission-preparation/src/contracts-v1.mts`
- `packages/mission-preparation/src/preparation-compiler-v1.mts`
- `packages/mission-preparation/tests/contracts-v1.test.mjs`
- `packages/mission-preparation/tests/preparation-compiler-v1.test.mjs`
- `packages/shield-team-system/src/mission-preparation-host-v1.mts`
- `packages/shield-team-system/src/runtime-binding-executor-v1.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs`
- `packages/shield-team-system/tests/runtime-binding-executor-v1.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- `packages/shield-team-system/package.json` only if a focused inferred target
  cannot be expressed without a script.

No mission-preparation store, seat-dispatch store, profile-aware journal
producer, package export, or authority contract change is authorized.

## Validation

- `npm exec nx run @shield/mission-preparation:build`
- `npm exec nx run @shield/mission-preparation:test`
- focused Team System host, executor, and real-CLI tests;
- existing profile-aware runtime-binding lifecycle tests;
- `npm exec nx run @shield/team-system:build`
- exact-base/head `npm exec nx affected -t build,test --base=3d3b80cdebe8b6e9858a27ffbdbe8090688ebbd1 --head=HEAD`;
- package-surface validation and `git diff --check`;
- Mack exact-revision validation and Fury exact-revision conformance review.

## Explicit exclusions

- No runtime-binding supersession or reviewed-graph replacement.
- No new authority class or changed authority meaning.
- No caller-asserted current state or host observation.
- No model invocation, packet dispatch, or local-runtime probe.
- No publication, ready-for-review, merge, deployment, release, or final
  acceptance.
- No passcode storage, relay, logging, environment variable, argv exposure, or
  model access.
