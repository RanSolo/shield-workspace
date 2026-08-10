# Issue #259 — production proving bridge Feature Flight plan (Fury-bound)

## Frozen identity and objective

- Repository: `RanSolo/shield-workspace`
- Base: `5de71f2550a75d558cf3a5c85ae9b551de77b628`
- Parent: `#251`
- Status: fresh-main Feature Flight plan; exact plan-for-Fury
- Objective: add the missing production host composition boundary for **read-only proving-flight preflight** without broad redesign.
- Exclusions (preserved): this issue does not run proving flight, does not grant authority, does not perform selection/review/completion control, and does not publish, merge, deploy, release, or enter #29.
- This commit is docs-only: only `docs/missions/issue-259-production-proving-bridge-plan.md` is modified.

## Current-main reconciliation

Read-only reconnaissance at the frozen base verified that the durable core is
already present and must be reused unchanged:

- `runFeatureFlightStepV1` already enforces the fixed Daisy action,
  validation, coordination effect, read-only capability, one-cycle stop,
  durable claim, exact replay, successor/result triad, and recovery states.
- schema-9 Daisy projection already requires active signed Daisy coordination
  authority and exactly one matching active runtime binding.
- `shield-ops` currently exposes evidence, acceptance, and `flight status`, but
  has no `flight run` production composition command.
- the external fixture launcher is the existing trusted boundary; fixture
  identity, baseline, package, symlink, and isolated-phase checks remain in
  force.

Therefore this issue does not modify the step core, Daisy authority,
schema-9 projection, mission CLI, or fixture worker. It only derives their
existing inputs at one production host boundary, adds the narrowly injected
fixture adapter, and records a separate authority-none measurement.

## Fury exact replacement scope

Create/modify only these files in implementation work:

- `docs/missions/issue-259-production-proving-bridge-plan.md` (this file)
- `packages/shield-team-system/src/permission-v1.mts` (pure `createRunnerPermissionDecisionV1` refactor)
- `packages/shield-team-system/scripts/operations/ops-cli.mjs`
- `packages/shield-team-system/scripts/operations/feature-flight-run.mjs`
- `packages/shield-team-system/scripts/operations/feature-flight-measurement.mjs`
- `benchmarks/v0.3-external-acceptance-v1/feature-flight-adapter.mjs`
- `benchmarks/v0.3-fixture-host-launcher.mjs` (backward-compatible captured-baseline input)
- `packages/shield-team-system/tests/permission-v1.test.mjs`
- `packages/shield-team-system/tests/operations-cli.test.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-run.test.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-measurement.test.mjs`
- `benchmarks/v0.3-external-acceptance-v1/test/feature-flight-adapter.test.mjs`
- `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`
- `packages/shield-team-system/tests/fixtures/esm-loader.mjs`

No other production, fixture, package, schema, or policy path is in scope.

## Feature Flight construction and lane ownership

Controlling Hill owns this plan, the shared interface freeze, lane sequencing,
exact revisions, unresolved decisions, and convergence. Relay packets are
coordination only; every receiver re-reads the repository and durable mission
evidence before acting.

The implementation flight has three lanes with non-overlapping ownership:

1. **Core/adapter May lane** owns the permission refactor, operations CLI,
   production run composition, external-acceptance adapter, host-launcher
   compatibility seam, ESM-loader fixture, and their focused tests. This lane
   owns the authority-to-claim-to-adapter critical path so opposite sides of
   that seam cannot drift independently.
2. **Measurement May lane** owns only
   `feature-flight-measurement.mjs` and its focused test. It consumes the
   frozen observation envelope defined below and cannot interpret authority,
   review, completion, or routing state.
3. **Mack acceptance lane** is independently read-only. Before implementation
   it freezes the black-box acceptance matrix in this plan; after convergence
   it executes the exact validation commands and maps observed results back to
   the matrix. Mack does not edit implementation or tests.

The measurement lane may proceed after Fury approves the frozen observation
envelope. The core lane may proceed after Fury approves the complete plan and
Coulson grants exact Wheels Up authority. Convergence occurs only after both
write lanes produce clean exact-head handoffs. Mack then validates the combined
revision, followed automatically by Fury exact-revision conformance review.

No lane may perform the actual #251 proving flight. No lane packet grants
authority, and no implementation lane may edit another lane's owned paths.

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

The command performs exactly one raw `replayProfileAwareMissionJournalV1` call and requires its valid schema-9 replay result. Bind only these actual replay fields:

- `missionId`
- `brief.subjectId`
- `brief.revisionId`
- `brief.participants`
- `authorization`
- `daisyCoordinationAuthority`
- `daisyCoordinationAuthorityState`
- exactly one entry in `activeDaisyRuntimeBindings`
- `lastSequence`

Claim root is derived solely from `daisyCoordinationAuthority.durableArtifactRoot`. The active Daisy binding must carry the same durable-artifact root exactly. May's `implementationAuthority` and `activeRuntimeBindings` are forbidden on this Daisy path.

### 3) Exact adapter restriction

`benchmarks/v0.3-external-acceptance-v1/feature-flight-adapter.mjs` exports exactly one factory, `createFeatureFlightAdapterV1({ launchExternalFixture })`. The host supplies that one trusted function as an own data field. The returned adapter accepts exactly `(plan, decision, adapterContext)` and may call only the injected `launchExternalFixture` once.

- `compose` and `grade` are forbidden.
- `adapterContext` is a frozen closed data object containing the fully derived `fixtureRoot`, eight-field `operatorInput`, captured release-baseline bytes, and closed launcher host context. No authority or permission result is accepted there.
- Adapter import is from captured source bytes only; loading the adapter may not follow external modules. The trusted launcher may subsequently import its existing verifier and driver after it has consumed the captured baseline bytes.
- Extend `launchExternalFixture` backward-compatibly so its closed `hostContext` accepts either the existing `baselinePath` form or a mutually exclusive captured-baseline byte form. The captured form parses the supplied exact bytes and never opens `releaseBaseline` by pathname. Existing callers and path-form behavior remain unchanged.
- Map launcher results exhaustively: `ready` -> executor `completed`; `blocked` or `invalid` -> executor `failed`; thrown/import/structural uncertainty -> executor `uncertain`. Every mapped result copies all identity fields from the exact runner plan, uses only stable reason/summary text, supplies nonempty evidence refs, and must pass `validateRunnerExecutorResult` before return.

### 4) Permission and claim purity

`createRunnerPermissionDecisionV1` in `src/permission-v1.mts` must be a pure decision function.

- No filesystem writes.
- No audit write before claim.
- No manifest-derived authority/effect interpretation.
- The fresh `authorizeRunner(plan)` callback calls `createRunnerPermissionDecisionV1(plan, frozenContext)` before claim, matching Runner's authorize-before-claim contract. The decision is not caller supplied or cached across runs.
- `authorization` in execution is purely derived from the callback decision and replayed projection.

## Mandatory executable fail-before-effects order

1. Parse manifest with unknown-key rejection.
2. Validate `contract` + `version`, and verify only the allowed manifest key set.
3. Open every artifact with no-follow semantics, retain descriptors, require regular files, capture descriptor identity and exact bytes, and verify before/after descriptor identity without pathname aliasing.
4. Verify each declared `sha256` against the captured bytes. Parse manifest, runner, schema-9, plan/state/predecessor, adapter, package, and release-baseline data only from those bytes.
5. Validate `sequence` as numeric and manifest-consistent with predecessor lineage.
6. Replay the captured schema-9 journal exactly once with `replayProfileAwareMissionJournalV1`; require the precise valid replay variant and fields listed above.
7. Re-observe repository identity from host root, branch, HEAD, and remote metadata and compare to replayed projection, including `commonGit`, `origin`, `remote`, and `participant` invariants.
8. Validate `fixtureRoot` identity against derived effective fixture boundary.
9. Resolve routing, Daisy coordination authority, active Daisy runtime binding, model/runtime/executor, claim root, and fixed effect tuple only from replay plus host observation. Require exactly one active Daisy binding; require seat, runtime, model, and executor identities to be pairwise distinct; and prohibit runtime/model/executor identity from equaling any participant identity.
10. Derive and freeze the runner permission context, claim root, remote descriptor, adapter descriptor, launcher inputs, and captured adapter/baseline bytes before calling the step. Supply captured plan/state/predecessor readers through `snapshotDependencies` so the step never reopens them.
11. Invoke exactly one `runFeatureFlightStepV1` with `maxSteps: 1`. Its fresh `authorizeRunner(plan)` callback invokes pure `createRunnerPermissionDecisionV1(plan, frozenContext)`; an authorized decision permits the existing core claim to execute next.
12. Only the step's execute callback, after durable claim, imports the already-captured adapter bytes, instantiates the factory with the trusted launcher, invokes the adapter once, maps its result, and validates the mapped executor result.

Any failure before the core claim may not mutate claim/result state, import the adapter, or invoke the launcher. Any failure after claim must produce the existing actionable recovery state and may not retry import or launch.

## Mandatory exact validations

- Manifest key set must be closed; unknown fields reject.
- `maxSteps` is fixed at `1` and immutable in execution path.
- One optional `predecessor` entry may be present; present predecessor entries must still satisfy hash/regular-file checks and sequence lineage.
- Runner input/schema9/adapters/releaseBaseline/package artifact bytes must match manifest digests exactly.
- No caller may assert allow/deny, review, completion, or gate result in manifest.
- Adapter import is only via retained captured source bytes and occurs only after durable claim.
- Every artifact uses no-follow descriptor capture, regular-file checks, before/after descriptor identity checks, and captured-byte reuse. No validated artifact is reopened by pathname for consumption.
- No mutation occurs for any validation or precondition failure.
- The eight launcher operator fields are derived exactly: `packageArtifactPath`, `externalRepositoryRoot`, `baseRevision`, `headRevision`, `hostConfiguration`, `blindStatus`, `priorSolutionsVisible`, and `requireSimmons`. The host context is closed and uses the captured release-baseline bytes; receipt, attribution, and tooling fields remain null for this read-only preflight.

## Mandatory hostile matrix (non-negotiable)

1. authority/binding substitution -> rejected before effects.
2. authority none / `gateEligible:false` -> rejected before effects.
3. symlink inputs -> rejected before effects.
4. non-regular artifact path types (symlink/nonregular/alias/device/fifo/socket) -> rejected before effects.
5. manifest byte drift -> rejected before effects.
6. repo identity substitution (`commonGit`, `origin`, `remote`, `participant`) -> rejected before effects.
7. spawned real CLI boundary -> rejected before effects.
8. zero/multiple active Daisy bindings, identity collision/impersonation, or fixed-identity mismatch -> rejected before effects.
9. replay zero calls / replay ambiguity -> rejected before effects.
10. post-claim recovery (non-recoverable/terminal states) -> no second real adapter invocation.
11. exact counts: every pre-claim rejection
    `claim/import/launcher/measurement = 0/0/0/0`; fresh success is
    `1/1/1/1`; terminal replay is `0/0/0/1`; incomplete/post-claim recovery
    performs no import or launcher reinvocation and records at most one
    measurement after durable recovery; concurrent contenders have aggregate
    launcher count at most one; import/launcher failure becomes terminal
    recovery with no second import or launch.
12. authority path/claim mismatch -> rejected before effects.
13. fixed tuple substitution (`action`, `effect`, `runtime`, `executor`, `fixture`, `package`, `repository`, `plan`, `state`, `sequence`) -> rejected before effects.
14. caller-submitted PASS/allow/review/completion -> rejected before effects.
15. missing fixture binding -> rejected before effects.

## Mandatory exact executable validation commands

- `npm run build --workspace @shield/team-system`
- `node --test packages/shield-team-system/tests/operations-cli.test.mjs`
- `node --test packages/shield-team-system/tests/operations-feature-flight-run.test.mjs`
- `node --test packages/shield-team-system/tests/operations-feature-flight-measurement.test.mjs`
- `node --test benchmarks/v0.3-external-acceptance-v1/test/feature-flight-adapter.test.mjs`
- `node --test packages/shield-team-system/tests/permission-v1.test.mjs`
- `node --test benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`
- `npm test --workspace packages/shield-team-system`

The spawned real-CLI test invokes Node with `--loader packages/shield-team-system/tests/fixtures/esm-loader.mjs` and a fixture-controlled loader that records/rejects adapter pathname reopening or external-module following before the trusted launcher boundary. Compatibility assertions preserve `createPermissionAuthorizer`, audited executor behavior, existing May decisions, all existing CLI commands/help, and exit codes.

## Measurement separation

The production command creates a separate authority-none #161 observation only
after the step core has returned a durable `completed`, `replayed`, or
`recovery_required` disposition. A rejection or stop before durable claim
creates no measurement filesystem effect.

`feature-flight-measurement.mjs` accepts one deeply frozen, closed observation
envelope assembled by the production command. It cannot read the mission
journal, evaluate permission, invoke an adapter, or alter step artifacts. The
envelope contains:

- exact mission, subject, mission revision, repository, branch, HEAD, plan,
  state, predecessor, runner-input, fixture, package, authority, binding, and
  step-result identities already verified by the core lane;
- exact seat, adapter, runtime, model, and executor identities;
- packet byte count and digest derived from the captured runner-input bytes;
- command start/end timestamps, latency, durable step outcome/reason, and
  whether this invocation was a replay/recovery;
- nullable processed-input, generated-output, reasoning-token,
  unique-injected-context, context-chain-position, Hill-action, retry-count,
  correction-count, intervention-count, cancellation, and provider-counter
  fields. Values unavailable from direct command/adapter observations remain
  `null`; they are never inferred.

The writer validates a closed `feature-flight-measurement@1` object with
`authority: "none"`, `gateEligible: false`, and an explicit notice that the
record cannot authorize, review, complete, route, publish, or accept a mission.
It canonicalizes the object, derives its SHA-256 identity, and performs a
create-only no-follow write beneath a fixed measurement namespace derived from
the verified durable-artifact root. Exact existing bytes are idempotent;
different existing bytes, aliasing, symlinks, write/sync/close uncertainty, or
readback mismatch return `measurement_recovery_required`.

Measurement failure never rewrites or downgrades the already durable Feature
Flight result. The CLI reports both dispositions and exits nonzero until the
measurement is durably recorded. Retrying re-enters the step through its
existing replay path and never reinvokes the fixture; it may then complete the
measurement write for that replay observation.

Tests prove the record is authority-none, content-addressed, create-only,
idempotent, nullable where counters are unknown, and unable to change the
authoritative step disposition. They inject substitution, symlink, collision,
partial-write, sync/close, and readback failures at the measurement boundary.

## Stop conditions

Stop for re-plan if any of the following are required:

- Any path outside this issue scope must be edited.
- Any authority/evidence value is sourced from manifest instead of replayed projection + host observation.
- Adapter imports occur before durable claim.
- Adapter calls anything beyond `launchExternalFixture`.
- Measurement becomes gate-eligible or completion/review authored in this issue.
- #29 or publication/merge/deploy/release/publish work is introduced.
