# Issue #171 Slice C — exact implementation plan

## Gate identity

- Mission: `mission:issue-171-slice-c`
- Mission revision: `sha256:4mTZkKHEO8g_duezUYanuU0U1rPHbG2vTrHB-IVVhEw`
- Base revision: `963e6f9f8edb9280e96bd42298ac306cd82513fb`
- Scope: issue #171 Slice C only
- Status: signed execution authority recorded; awaiting exact-revision Fury
  re-review

## Frozen objective

Add one production schema-9 May permission-context loader. It reads the durable
mission journal, consumes only replayed active Wheels Up authority and active
May runtime binding, observes the live repository root, branch, HEAD,
writability, and required host capabilities, and returns a validated
`PermissionInvocationContext` or a closed blocked result before any effect.

## Contract decisions

1. Add `schema9-permission-context-v1.mts` as a context-construction boundary,
   not a new authority source. Its public async loader accepts mission-journal
   location, exact runner plan and decision identity, host identity, and bounded
   trusted host-operation dependencies. It does not accept an authority,
   runtime binding, capability list, repository observation, or prebuilt
   context. Snapshot and validate all input values and dependency function
   references before the first `await`.
2. Read through `readMissionJournalForDisplay`. Require `kind=profile-aware`,
   schema 9, exact mission/subject/revision/sequence match to the runner plan,
   authorized and not-completed execution state, one active implementation
   authority, and exactly one active `may` binding for the plan.
3. Revalidate the authority and schema-9 binding shapes and their exact
   authority reference/digest/sequence and scope-subset relationship. Copy only
   the embedded active `RuntimeBinding` into
   `PermissionInvocationContext.activeBindings`; never use historical or
   superseded bindings.
4. Derive reasoning-runtime, model-bound binding, tool-executor, repository,
   canonical writable root, branch, artifact revision, and journal sequence
   from replayed state. Caller values cannot override them. The model ID remains
   binding evidence and is not invoked.
5. Define one strict revision invariant for the current May executor: authority
   `artifactRevisionId`, embedded runtime-binding `artifactRevisionId`, wrapper
   `headRevision`, authority `headRevision`, and live Git `HEAD` must all be the
   same revision. A schema-valid authority whose artifact and head revisions
   differ is not executable through this loader.
6. Establish a bounded freshness window during each load. Read and canonically
   digest the replayed journal; observe the requested root, Git top-level,
   branch, and `HEAD`; probe writability and capabilities; then re-observe the
   complete Git tuple and reread/replay/digest the journal. Require exact
   equality of both Git observations and both journal entries/projections,
   digest, sequence, active authority, and active binding before return.
   Detached HEAD, aliases, observation errors, revocation, supersession,
   sequence movement, branch movement, or HEAD movement fail closed.
7. Derive `requiredCapabilities` conservatively as every capability in the
   active binding's approved scope, in canonical order. Probe each through the
   snapshotted trusted host capability operation and require each to remain a
   subset of Wheels Up. Do not accept a free caller capability array. Issue
   #170 may later derive a narrower exact operation-to-capability set when it
   composes dispatch.
8. Construct exactly one root attestation, one writability attestation, and one
   attestation per required capability. Bind all attestations to one host,
   replayed executor/repository/root, the exact load time, and deterministic
   content-derived IDs. Use zero-duration freshness (`observedAt`, `expiresAt`,
   and context `evaluatedAt` equal) so a later authorization/execution lookup
   must reload live state rather than reuse a lease.
9. Update permission revalidation so authorization, claim, and execution may
   each use a newly loaded context with different attestation timestamps and
   IDs. Every fresh context must independently evaluate `allow` for the exact
   plan and must exact-match the decision's stable mission, revision, sequence,
   binding, runtime, executor, repository, root, branch, artifact, and scope
   identity. Volatile attestation identity and `evaluatedAt` are intentionally
   not compared canonically across loads.
10. In the runtime-claimed executor, retain and verify the original claim's
    immutable invocation record and receipt. Do not reconstruct that historical
    claim from execute-time attestations. The execute-time context still must
    independently evaluate `allow` and stable-match the claimed binding and
    decision before the executor is called.
11. Validate the completed context with
   `validatePermissionInvocationContext` before returning `ready`. Return no
   partial context on any failure.
12. Expose a dedicated package subpath for the loader and its result types and
    document it in `PUBLIC_API.md`. Do not wire it into `mission-runtime-v1`,
    `local-tools`, or the #170 dispatch composition in this slice.
13. The loader is read-only. It must not append journal, audit, or control-event
    records; mutate the worktree; invoke a model or tool; or publish externally.
14. This double-observation establishes freshness at loader return only. Issue
    #170 must define claim-versus-revocation serialization or another explicit
    pre-effect linearization rule; Slice C does not claim that guarantee.

## Closed result taxonomy and precedence

The loader returns `ready` with the validated context or `blocked` with one
closed code and errors. Failures are resolved in this order:

1. `input_invalid` — malformed request, plan, decision, host, time, or trusted
   host dependency.
2. `schema_unsupported` — `readMissionJournalForDisplay` returns
   `unsupported_schema` or `schema_mixed`, or returns a valid legacy journal.
   `journal_invalid` — every other invalid mission-store result, including
   missing, unreadable, malformed, incomplete, unsafe, or replay-invalid
   journals. A malformed authority or binding rejected during replay maps here,
   not again at a later precedence level.
3. `mission_mismatch` / `revision_mismatch` / `sequence_mismatch` — plan does
   not exact-match replayed mission state.
4. `authority_missing` / `authority_inactive` — Wheels Up is absent, revoked,
   malformed, or no longer executable.
5. `binding_missing` / `binding_ambiguous` / `binding_invalid` — a structurally
   valid replay projection has no active May binding, more than one, or a
   defensive post-replay identity/scope/revision inconsistency. Replay-invalid
   binding records were already classified as `journal_invalid`.
6. `observation_failed` / `root_mismatch` / `branch_mismatch` /
   `head_mismatch` — live Git/worktree observation is unavailable or stale.
7. `writability_unavailable` / `capability_unavailable` — the live host cannot
   prove an exact required capability.
8. `context_invalid` — final closed permission-context validation fails.

No code path proceeds to effects; a host using the loader as
`getPermissionContext` receives either a newly observed exact context or a
failure.

## Bounded path set

- Add `packages/shield-team-system/src/schema9-permission-context-v1.mts`.
- Add `packages/shield-team-system/tests/schema9-permission-context-v1.test.mjs`.
- Update `packages/shield-team-system/src/permission-v1.mts` only to distinguish
  stable decision/binding identity from freshly regenerated attestation data
  and to preserve the original claimed invocation receipt.
- Update `packages/shield-team-system/tests/permission-v1.test.mjs` with
  distinct-clock authorization/claim/execution and volatile-attestation cases.
- Update `packages/shield-team-system/package.json` with the explicit
  `./schema9-permission-context` export.
- Update `packages/shield-team-system/tests/package-surface.test.mjs` for the
  export, packed files, ESM import, and TypeScript surface.
- Update `packages/shield-team-system/PUBLIC_API.md` for the supported export and
  its read-only, non-composing boundary.
- Add only this plan, reconnaissance, and existing mission brief under
  `docs/missions/`.

No edits to mission runtime, local model adapters, schema-9 authority/replay,
audit store, May control store, CLI, or GitHub code are authorized unless Fury
identifies a concrete correctness requirement.

## Acceptance tests

- A durable schema-9 journal with active Wheels Up and one active May binding,
  exact live root/branch/HEAD, writable root, and available required
  capabilities produces one valid context whose identity and scope are wholly
  replay-derived.
- Restart/readback produces the same authority-bound fields while issuing fresh
  attestations; superseded binding versions never appear active.
- Authorization, claim, and execution at three distinct clock values use fresh
  zero-duration attestations, independently re-evaluate permission, preserve
  stable authority/decision identity, verify the original claim receipt, and
  reach the executor exactly once.
- Missing, malformed, mixed-schema, legacy, stale-sequence, revoked,
  post-completion, missing-binding, ambiguous-binding, and overbroad state fail
  before live capability release or any effect.
- Symlink/aliased root, wrong Git top-level, detached/wrong branch, stale/wrong
  HEAD, failed Git observation, unwritable root, unavailable capability, and
  malformed capability observation fail closed.
- Journal revocation/supersession/sequence mutation and root/branch/HEAD movement
  during one load are detected by the second observation; branch or HEAD drift
  between loads is also detected. No prior context is cached or reused.
- A schema-valid authority/binding with unequal artifact and head revisions is
  blocked even when live `HEAD` equals one of them.
- Caller input cannot substitute runtime, model, executor, repository, root,
  branch, artifact, authority, or binding identity.
- Context attestation cardinality, host/executor/repository/root binding,
  timestamps, IDs, and final permission validation are exact and deterministic.
- Omitting capabilities is impossible at the loader API: all active-binding
  capabilities are probed unless #170 later supplies a separately reviewed
  closed operation mapping.
- Focused tests prove the loader performs no journal append, audit append,
  control-event append, model request, tool invocation, or repository mutation.
- Existing schema-9 authority, permission, mission-runtime, May executor, and
  package-surface behavior remains compatible.

## Validation commands

Run with the package-owned toolchain and serialize the full suite because #182
tracks the pre-existing parallel `npm pack`/shared-`dist` race:

```bash
npm run build --workspace packages/shield-team-system
node --test packages/shield-team-system/tests/schema9-permission-context-v1.test.mjs
node --test packages/shield-team-system/tests/schema9-implementation-authority.test.mjs
node --test packages/shield-team-system/tests/permission-v1.test.mjs
node --test packages/shield-team-system/tests/mission-runtime-v1.test.mjs
node --test packages/shield-team-system/tests/package-surface.test.mjs
node --test --test-concurrency=1 packages/shield-team-system/tests/*.test.mjs
```

## Explicit stop

Stop after one bounded PR is ready for human review. Do not enter issue #170,
invoke May or any local/hosted model as product behavior, execute an authorized
tool effect, merge, deploy, release, or run #137 externally.
