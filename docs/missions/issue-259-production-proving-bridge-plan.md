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

The implementation flight has three persistent Lane Hills with non-overlapping
ownership. Each Lane Hill retains its lane-local context, dispatches only the
seats needed inside that lane, and returns compact exact-revision packets to
Controlling Hill:

Each implementation Lane Hill retains dedicated Daisy, May, Mack, and Fury
thread handles for the life of its lane and resumes them as facts,
implementation, validation, or conformance work becomes necessary. The lane
descriptions below assign write ownership and primary work; they do not reduce
the Lane Hill's governed team. Lane Mack and Fury remain independent of May.
After lane-local review, Controlling Hill routes the converged exact revision
through a separate flight-level Mack validation and Fury conformance gate.

1. **Core/adapter Lane Hill** dispatches May for the permission refactor,
   operations CLI, production run composition, external-acceptance adapter,
   host-launcher compatibility seam, ESM-loader fixture, and their focused
   tests. This lane owns the authority-to-claim-to-adapter critical path so
   opposite sides of that seam cannot drift independently.
2. **Measurement Lane Hill** dispatches May only for
   `feature-flight-measurement.mjs` and its focused test. It consumes the
   frozen observation envelope defined below and cannot interpret authority,
   review, completion, or routing state.
3. **Validation Lane Hill** dispatches Mack as an independently read-only
   validator. Before implementation Mack freezes the black-box acceptance
   matrix in this plan; after convergence Mack executes the exact validation
   commands and maps observed results back to the matrix. Mack does not edit
   implementation or tests.

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
- `releaseBaseline`: `{ path, sha256 }`
- `packageArtifact`: `{ path, sha256 }`
- `measurementIntentId`
- `sequence`

All routing, authority, implementation/runtime/executor, and effect identities are derived only from replayed signed evidence and host observation and are never accepted from manifest input.

The command calls the existing `loadSchema9PermissionContextV1` exactly once
with the captured Runner plan and the repository configuration's journal path.
That loader owns the canonical `runner_permission` projection, both schema-9
journal/repository freshness passes, durable-root/worktree isolation checks,
writability observation, and capability probes. Its result must be the
Daisy-ready variant and therefore preserves all existing predicates for
authorization, execution/final-acceptance lifecycle, profile readiness, exact
execution-gate evidence, authority digest/sequence, one active binding, plan
scope, repository/root/branch/HEAD freshness, journal drift, and host
attestations.

The production command exact-compares the returned immutable permission
context and Daisy coordination metadata against the captured Runner projection
and plan: mission, subject, mission revision, artifact revision, evaluated
sequence, runtime/model/executor, action/effect/capability scope, repository,
branch, durable root, authority digest/sequence, and binding identity must
match. No parallel partial replay, hand-selected field subset, or independently
reconstructed permission context is permitted.

Claim root is derived solely from `daisyCoordinationAuthority.durableArtifactRoot`. The active Daisy binding must carry the same durable-artifact root exactly. May's `implementationAuthority` and `activeRuntimeBindings` are forbidden on this Daisy path.

### 2a) Signed proving tuple

The host derives one closed proving tuple after descriptor-safe capture:

- exact plan digest and `flightId`;
- fixed fixture ID `fixture:v0.3:external-acceptance:1` and the canonical
  fixture root derived from the checked-out repository root;
- adapter source at the single fixed repository-relative path and its digest;
- captured fixture-identity and release-baseline digests;
- captured package digest, which must equal
  `releaseBaseline.package.digest`;
- exact repository, branch, HEAD, mission, subject, mission revision,
  `measurementIntentId`, and a canonical Runner-intent projection containing
  every Runner plan/input identity except `effectKey` and any digest computed
  from the final Runner input.

Canonical JSON of that tuple is SHA-256 hashed into the exact signed Daisy
coordination `effectKey`. The Runner plan, Daisy authority, and active binding
must all carry that effect key. The manifest may locate the release baseline
and package bytes, but its digests are never trust anchors: captured bytes must
match the signed proving tuple. The fixture root and adapter path are
host-fixed and cannot be supplied by the caller.

After inserting the derived effect key into the final Runner plan/input, the
host computes the final Runner-input digest separately. That digest is verified
against the captured bytes and bound by the existing step claim/result
contracts, but it does not feed back into the proving-tuple hash. Tests build
the intent, derive the effect key, finalize the Runner input, and prove that
substitution of either the intent fields, derived key, or final input digest is
rejected without requiring a hash fixed point.

Because the existing core claim identity already includes plan digest,
`flightId`, mission identity, and effect key, binding the complete proving
tuple into the signed effect key prevents a self-consistent substituted plan,
fixture, adapter, baseline, package, or measurement intent from opening a new
authorized execute-once namespace.

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

1. Open the manifest itself with no-follow and nonblocking semantics; retain its
   descriptor, require one regular file, reject symlink/hard-link aliasing and
   unsafe mode/identity, capture exact bytes, and prove descriptor identity is
   stable before parsing.
2. Parse only the captured manifest bytes, reject unknown keys, and validate
   the exact `contract` + `version`.
3. Open every referenced or host-fixed artifact with the same retained,
   no-follow, nonblocking regular-file rules; capture exact bytes and prove
   before/after descriptor identity without pathname reuse or aliasing.
4. Verify each declared digest against captured bytes. Parse runner,
   plan/state/predecessor, package, release-baseline, fixture identity, and
   adapter data only from captured bytes.
5. Validate `sequence` as numeric and manifest-consistent with predecessor
   lineage.
6. Call `loadSchema9PermissionContextV1` once and require its exact Daisy-ready
   result described above. Exact-compare the immutable permission context and
   Daisy coordination metadata to the captured Runner plan/projection and
   reject every lifecycle, readiness, gate, authority, binding, capability,
   sequence, repository, or identity mismatch.
7. Derive the complete proving tuple from captured bytes and host observation;
   require its digest-derived effect key to exact-match the signed Daisy
   authority, active binding, and Runner plan.
8. Resolve routing, model/runtime/executor, claim root, and fixed effect tuple
   only from the ready projection plus host observation. Require seat, runtime,
   model, and executor identities to be pairwise distinct and prohibit runtime,
   model, or executor identity from equaling any participant identity.
9. Derive and freeze the runner permission context, claim root, remote
   descriptor, adapter descriptor, measurement intent, launcher inputs, and
   captured adapter/baseline/package bytes before calling the step. Supply
   captured plan/state/predecessor readers through `snapshotDependencies` so
   the step never reopens them.
10. Invoke exactly one `runFeatureFlightStepV1` with `maxSteps: 1`. Its fresh
    `authorizeRunner(plan)` callback invokes pure
    `createRunnerPermissionDecisionV1(plan, frozenContext)`; an authorized
    decision permits the existing core claim to execute next.
11. Only the step's execute callback, after durable claim, imports the
    already-captured adapter bytes, instantiates the factory with the trusted
    launcher, invokes the adapter once, maps its result, and validates the
    mapped executor result.

Any failure before the core claim may not mutate claim/result state, import the adapter, or invoke the launcher. Any failure after claim must produce the existing actionable recovery state and may not retry import or launch.

## Mandatory exact validations

- Manifest key set must be closed; unknown fields reject.
- `maxSteps` is fixed at `1` and immutable in execution path.
- One optional `predecessor` entry may be present; present predecessor entries must still satisfy hash/regular-file checks and sequence lineage.
- Runner input, adapter, fixture identity, release-baseline, and package bytes
  must match the signed proving tuple exactly; manifest-declared digests alone
  never establish trust.
- No caller may assert allow/deny, review, completion, or gate result in manifest.
- Adapter import is only via retained captured source bytes and occurs only after durable claim.
- The manifest and every artifact use nonblocking no-follow descriptor capture,
  single-link regular-file checks, before/after descriptor identity checks,
  hard-link/alias rejection, and captured-byte reuse. No validated artifact is
  reopened by pathname for consumption.
- No mutation occurs for any validation or precondition failure.
- The eight launcher operator fields are derived exactly: `packageArtifactPath`, `externalRepositoryRoot`, `baseRevision`, `headRevision`, `hostConfiguration`, `blindStatus`, `priorSolutionsVisible`, and `requireSimmons`. The host context is closed and uses the captured release-baseline bytes; receipt, attribution, and tooling fields remain null for this read-only preflight.

## Mandatory hostile matrix (non-negotiable)

1. authority/binding substitution -> rejected before effects.
2. authority none / `gateEligible:false` -> rejected before effects.
3. symlink inputs -> rejected before effects.
4. manifest or artifact hard-link aliases, replacement, unsafe mode, or
   non-regular path types (symlink/device/FIFO/socket) -> rejected before
   effects without blocking on open.
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

The production command uses this exhaustive step-outcome table:

| Step outcome                           | Measurement action                                    | CLI disposition                                           |
| -------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| `completed`                            | create/read the stable measurement target             | success only after durable measurement                    |
| `replayed`                             | read the same stable target; create it only if absent | success only after durable measurement                    |
| `recovery_required`, `durable:true`    | create/read the stable target                         | report durable step recovery plus measurement disposition |
| `legacy_replayed`                      | no measurement                                        | nonzero, explicit legacy migration/recovery required      |
| `recovery_required`, `durable:false`   | no measurement                                        | nonzero, preserve ephemeral recovery handoff              |
| `stopped`, thrown, or malformed result | no measurement                                        | nonzero, no new filesystem effect                         |

Thus a rejection or stop before durable claim creates no measurement
filesystem effect, and only a durable v2 terminal can be measured.

`feature-flight-measurement.mjs` accepts one deeply frozen, closed observation
envelope assembled by the production command. It cannot read the mission
journal, evaluate permission, invoke an adapter, or alter step artifacts. The
envelope contains:

- exact mission, subject, mission revision, repository, branch, HEAD, plan,
  state, predecessor, runner-input, fixture, package, authority, binding, and
  step-result identities already verified by the core lane;
- exact seat, adapter, runtime, model, and executor identities;
- packet byte count and digest derived from the captured runner-input bytes;
- first-observed command start/end timestamps, latency, durable step
  outcome/reason, and whether measurement persistence first completed during a
  fresh, replay, or recovery invocation;
- nullable processed-input, generated-output, reasoning-token,
  unique-injected-context, context-chain-position, Hill-action, retry-count,
  correction-count, intervention-count, cancellation, and provider-counter
  fields. Values unavailable from direct command/adapter observations remain
  `null`; they are never inferred.

`measurementIntentId` is an opaque canonical identifier carried in the closed
manifest and included in the signed proving tuple. The measurement target path
is derived from the effect claim and that signed intent; a caller cannot choose
a replacement intent without invalidating Daisy authority.

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
measurement is durably recorded. On retry, the writer first reads the one
signed-intent target. A valid existing record whose stable tuple matches is the
winner and is returned unchanged, including its original timestamps; malformed,
conflicting, or uncertain existing bytes remain recovery-required and cannot be
bypassed with a new pathname. If the target is proven absent, retry re-enters
the step through its existing replay path, never reinvokes the fixture, and may
create that same target with the newly observed timing fields.

Tests prove the record is authority-none, content-addressed, create-only,
idempotent, nullable where counters are unknown, and unable to change the
authoritative step disposition. They inject substitution, symlink, collision,
partial-write, sync/close, and readback failures at the measurement boundary.
The spawned CLI retry test proves an uncertain first write cannot be bypassed
and that an absent target can be recovered without a second fixture invocation.

## Stop conditions

Stop for re-plan if any of the following are required:

- Any path outside this issue scope must be edited.
- Any authority/evidence value is sourced from manifest instead of replayed projection + host observation.
- Adapter imports occur before durable claim.
- Adapter calls anything beyond `launchExternalFixture`.
- Measurement becomes gate-eligible or completion/review authored in this issue.
- #29 or publication/merge/deploy/release/publish work is introduced.
