# Issue #259 — production proving bridge replacement (Fury-bound)

## Frozen identity and objective

- Repository: `RanSolo/shield-workspace`
- Base: `e4a0cf095593495b6cd65d0bc64cb3b8097b5a74`
- Parent: `#251`
- Status: replacement plan for prior #259 draft; exact plan-for-Fury
- Objective (preserved): add the missing production host composition boundary for proving-flight execution without broad redesign.
- Exclusions (preserved): this issue does not run proving flight, grant authority, perform selection/review/completion control, publish, merge, deploy, release, or enter #29.

## Fury exact replacement scope

Create/modify only these files:

- `docs/missions/issue-259-production-proving-bridge-plan.md` (this file)
- `packages/shield-team-system/src/permission-v1.mts` (pure `createRunnerPermissionDecisionV1` refactor)
- `packages/shield-team-system/scripts/operations/ops-cli.mjs`
- `packages/shield-team-system/scripts/operations/feature-flight-run.mjs`
- `benchmarks/v0.3-external-acceptance-v1/feature-flight-adapter.mjs`
- `packages/shield-team-system/tests/permission-v1.test.mjs`
- `packages/shield-team-system/tests/operations/cli.test.mjs`
- `packages/shield-team-system/tests/ops/run/feature-flight.test.mjs`
- `packages/shield-team-system/tests/adapter/feature-flight-adapter.test.mjs`
- `packages/shield-team-system/tests/fixtures/esm-loader.mjs`

No other production, fixture, package, schema, or policy path is in scope.

## Design binding

### 1) One production command

Add/define one command:

`shield-ops flight run --input FILE`

It must execute exactly one `runFeatureFlightStepV1` call with fixed `maxSteps=1` and no loops, retries, scheduler, or fallback branches.

### 2) Closed manifest

Input is a closed manifest containing only:

- `contract`
- `version`
- `plan`: `{ path, sha256 }`
- `state`: `{ path, sha256 }`
- optional `predecessor`: `{ path, sha256 }`
- `runnerInput`: `{ path, sha256 }`
- `schema9Journal`: `{ path, sha256 }`
- optional `fixedPredecessor`: `{ path, sha256 }`
- `sequence`
- `fixtureRoot`: `{ path }`

All routing, authority, implementation/runtime/executor claim identities, and effect identity are derived from replayed signed evidence and repository observations. They are never accepted from manifest input.

### 3) Exact adapter restriction

`benchmarks/v0.3-external-acceptance-v1/feature-flight-adapter.mjs` may call only `launchExternalFixture`.

- `compose` and `grade` are forbidden.
- It accepts only the exact bound runner plan and permission decision.

### 4) Permission and claim purity

`createRunnerPermissionDecisionV1` in `src/permission-v1.mts` must be a pure decision function.

- No filesystem writes.
- No audit write before claim.
- No manifest-derived authority/effect interpretation.

## Mandatory 12-step fail-before-effects order

1. Parse manifest with unknown-key rejection.
2. Validate `contract` + `version` and verify only the allowed manifest key set.
3. Resolve manifest paths by canonical path checks (no alias-following semantics).
4. Verify each required path is a file where required and each `sha256` matches exact on-disk bytes.
5. Validate `sequence` as numeric and manifest-consistent with flight progression.
6. Replay schema-9 journal to resolve active implementation authority, active binding, and claim references.
7. Re-observe repository root/branch/HEAD and remote identity from host and compare to derived projection.
8. Validate fixture root identity against derived effective fixture boundary.
9. Derive routing/authority/runtime/executor identities from derived replay data; compare against manifest-free invariants.
10. Enforce model/runtime/executor collision checks and fixed binding tuple constraints.
11. Invoke `createRunnerPermissionDecisionV1`; require allow/authorized only from local pure decision.
12. Capture adapter module source + descriptor, import the adapter only after durable claim creation, then invoke step logic.

Any failure at any step before step 12 is terminal and may not trigger fixture execution, adapter import, or claim/result mutation.

## Mandatory exact validations

- Manifest key set must be closed; unknown fields reject.
- `maxSteps` is fixed at `1` and immutable in execution path.
- Optional predecessor entries may be absent; present optional predecessor entries must still satisfy hash/regular-file checks and sequence lineage.
- Runner input/schema9/journal bytes must match manifest digests exactly.
- No caller may assert allow/deny, review, completion, or gate result in manifest.
- Adapter import is only via captured source artifact and happens only after durable claim.
- No mutation occurs for any validation or precondition failure.

## Mandatory hostile matrix (non-negotiable)

1. Unknown manifest key -> rejected before any import/effect.
2. Tampered path/sha256 -> rejected before import/effect.
3. Duplicate or missing required artifact entries -> rejected before import/effect.
4. Stale or forked sequence/journal lineage -> rejected before import/effect.
5. Authority path/claim mismatch -> rejected before import/effect.
6. Model/runtime/executor collision (pairwise-equal identities) -> rejected before import/effect.
7. Missing fixture binding -> rejected before import/effect.
8. Caller-submitted PASS/allow/review/completion -> rejected before import/effect.
9. Fixed tuple substitution (action/effect/runtime/executor/fixture/package/repository) -> rejected before import/effect.
10. Replay ambiguity -> rejected before import/effect.
11. Manifest-only authority attempt without derived routing -> rejected before import/effect.
12. Adapter throws, partial output, non-canonical output, or composition/grade code path -> converted to existing recovery disposition only.

## Measurement separation

No measurement evidence record is authored in this issue. Measurement persistence and schema finalization are explicitly deferred to a follow-up mission.

## Validation sequencing for this issue

Plan validation scope is exactly the above files and tests:

1. Run targeted command/adapters/permission tests.
2. Run operation CLI path tests.
3. Run `ops/run` runner-path tests.
4. Run adapter tests with fixture-backed module import and launcher seam.
5. Confirm adapter cannot be invoked via compose/grade path.
6. Confirm replay returns no second real adapter invocation.

## Stop conditions

Stop for re-plan if any of the following are required:

- Any path outside this issue scope must be edited.
- Any authority/evidence value is sourced from manifest instead of replay/host observation.
- Adapter imports occur before durable claim.
- Adapter calls anything beyond `launchExternalFixture`.
- Measurement becomes gate-eligible or completion/review authored in this issue.
- #29 or publication/merge/deploy/release/publish work is introduced.
