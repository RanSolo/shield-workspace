# Issue #259 — production proving bridge replacement (read-only proving-flight preflight, Fury-bound)

## Frozen identity and objective

- Repository: `RanSolo/shield-workspace`
- Base: `e4a0cf095593495b6cd65d0bc64cb3b8097b5a74`
- Parent: `#251`
- Status: replacement plan for prior #259 draft; exact plan-for-Fury
- Objective: add the missing production host composition boundary for **read-only proving-flight preflight** without broad redesign.
- Exclusions (preserved): this issue does not run proving flight, does not grant authority, does not perform selection/review/completion control, and does not publish, merge, deploy, release, or enter #29.
- This commit is docs-only: only `docs/missions/issue-259-production-proving-bridge-plan.md` is modified.

## Fury exact replacement scope

Create/modify only these files in implementation work:

- `docs/missions/issue-259-production-proving-bridge-plan.md` (this file)
- `packages/shield-team-system/src/permission-v1.mts` (pure `createRunnerPermissionDecisionV1` refactor)
- `packages/shield-team-system/scripts/operations/ops-cli.mjs`
- `packages/shield-team-system/scripts/operations/feature-flight-run.mjs`
- `benchmarks/v0.3-external-acceptance-v1/feature-flight-adapter.mjs`
- `packages/shield-team-system/tests/permission-v1.test.mjs`
- `packages/shield-team-system/tests/operations-cli.test.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-run.test.mjs`
- `benchmarks/v0.3-external-acceptance-v1/test/feature-flight-adapter.test.mjs`
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
- `adapterSource`: `{ path, sha256 }`
- `releaseBaseline`: `{ path, sha256 }`
- `packageArtifact`: `{ path, sha256 }`
- `sequence`
- `fixtureRoot`: `{ path }`

All routing, authority, implementation/runtime/executor, and effect identities are derived only from replayed signed evidence and host observation and are never accepted from manifest input.

Daisy-ready projection fields used for these derivations are exact projection fields:

- `missionId`
- `subjectId`
- `brief`
- `implementationAuthority`
- `implementationAuthorityState`
- `daisyCoordinationAuthority`
- `daisyCoordinationBinding`
- `activeRuntimeBindings`
- `durableArtifactRoot`

Claim root must be derived solely from `durableArtifactRoot` and must not be sourced from manifest values.

### 3) Exact adapter restriction

`benchmarks/v0.3-external-acceptance-v1/feature-flight-adapter.mjs` may call only `launchExternalFixture`.

- `compose` and `grade` are forbidden.
- It accepts only the exact bound runner plan and permission decision.
- Adapter import must be import-free (captured-byte execution only) with no external module follow.

### 4) Permission and claim purity

`createRunnerPermissionDecisionV1` in `src/permission-v1.mts` must be a pure decision function.

- No filesystem writes.
- No audit write before claim.
- No manifest-derived authority/effect interpretation.
- Permission check/replay decision must be called fresh inside the execution callback; do not cache it outside the callback.
- `authorization` in execution is purely derived from the callback decision and replayed projection.

## Mandatory 12-step fail-before-effects order

1. Parse manifest with unknown-key rejection.
2. Validate `contract` + `version`, and verify only the allowed manifest key set.
3. Resolve manifest paths via canonical path checks (no alias-following semantics).
4. Verify each required path is a regular file where required and each `sha256` matches exact on-disk bytes.
5. Validate `sequence` as numeric and manifest-consistent with predecessor lineage.
6. Replay one schema-9 projection/authority/claim chain via a single core-replay call.
7. Re-observe repository identity from host root, branch, HEAD, and remote metadata and compare to replayed projection, including `commonGit`, `origin`, `remote`, and `participant` invariants.
8. Validate `fixtureRoot` identity against derived effective fixture boundary.
9. Resolve routing/authority/runtime/executor claims from replayed projection only and compare against fixed invariants.
10. Enforce at-most-one model/runtime/executor and fixed tuple constraints.
11. Invoke `createRunnerPermissionDecisionV1` inside the execute callback; require allow/authorized only from local pure decision.
12. In execute callback after durable claim creation only:
   - derive adapter descriptor from policy + replayed identities,
   - capture adapter source bytes from descriptor-backed regular-file descriptor,
   - import exact captured source bytes without pathname reopen,
   - invoke adapter once through `launchExternalFixture`.

Any failure before step 12 is terminal and may not trigger fixture execution, adapter import, or claim/result mutation.

## Mandatory exact validations

- Manifest key set must be closed; unknown fields reject.
- `maxSteps` is fixed at `1` and immutable in execution path.
- One optional `predecessor` entry may be present; present predecessor entries must still satisfy hash/regular-file checks and sequence lineage.
- Runner input/schema9/adapters/releaseBaseline/package artifact bytes must match manifest digests exactly.
- No caller may assert allow/deny, review, completion, or gate result in manifest.
- Adapter import is only via captured source artifact and occurs only after durable claim.
- Descriptor-backed capture must be of regular file identity and exact source bytes only.
- No mutation occurs for any validation or precondition failure.

## Mandatory hostile matrix (non-negotiable)

1. authority/binding substitution -> rejected before effects.
2. authority none / `gateEligible:false` -> rejected before effects.
3. symlink inputs -> rejected before effects.
4. non-regular artifact path types (symlink/nonregular/alias/device/fifo/socket) -> rejected before effects.
5. manifest byte drift -> rejected before effects.
6. repo identity substitution (`commonGit`, `origin`, `remote`, `participant`) -> rejected before effects.
7. spawned real CLI boundary -> rejected before effects.
8. simultaneous at-most-one violation -> rejected before effects.
9. replay zero calls / replay ambiguity -> rejected before effects.
10. post-claim recovery (non-recoverable/terminal states) -> no second real adapter invocation.
11. exact launcher counts and launcher-sequence discipline -> enforced.
12. authority path/claim mismatch -> rejected before effects.
13. fixed tuple substitution (`action`, `effect`, `runtime`, `executor`, `fixture`, `package`, `repository`, `plan`, `state`, `sequence`) -> rejected before effects.
14. caller-submitted PASS/allow/review/completion -> rejected before effects.
15. missing fixture binding -> rejected before effects.

## Mandatory exact executable validation commands

- `node --test packages/shield-team-system/tests/operations-cli.test.mjs`
- `node --test packages/shield-team-system/tests/operations-feature-flight-run.test.mjs`
- `node --test benchmarks/v0.3-external-acceptance-v1/test/feature-flight-adapter.test.mjs`
- `node --test packages/shield-team-system/tests/permission-v1.test.mjs`
- `npm test --workspace packages/shield-team-system`

## Measurement separation

No measurement evidence record is authored in this issue. Measurement persistence and schema finalization are explicitly deferred to a follow-up mission.

## Stop conditions

Stop for re-plan if any of the following are required:

- Any path outside this issue scope must be edited.
- Any authority/evidence value is sourced from manifest instead of replayed projection + host observation.
- Adapter imports occur before durable claim.
- Adapter calls anything beyond `launchExternalFixture`.
- Measurement becomes gate-eligible or completion/review authored in this issue.
- #29 or publication/merge/deploy/release/publish work is introduced.
