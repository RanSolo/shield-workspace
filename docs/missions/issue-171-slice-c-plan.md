# Issue #171 Slice C — exact implementation plan

## Gate identity

- Mission: `mission:issue-171-slice-c`
- Mission revision: `sha256:4mTZkKHEO8g_duezUYanuU0U1rPHbG2vTrHB-IVVhEw`
- Base revision: `963e6f9f8edb9280e96bd42298ac306cd82513fb`
- Scope: issue #171 Slice C only
- Status: awaiting exact-revision Fury review and signed execution authority

## Frozen objective

Add one production schema-9 May permission-context loader. It reads the durable
mission journal, consumes only replayed active Wheels Up authority and active
May runtime binding, observes the live repository root, branch, HEAD,
writability, and required host capabilities, and returns a validated
`PermissionInvocationContext` or a closed blocked result before any effect.

## Contract decisions

1. Add `schema9-permission-context-v1.mts` as a context-construction boundary,
   not a new authority source. Its public async loader accepts mission-journal
   location, exact runner plan and decision identity, host identity, required
   capabilities, and bounded host-operation dependencies. It does not accept an
   authority, runtime binding, repository observation, or prebuilt context.
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
5. During each load, resolve the requested repository root and Git top-level to
   canonical real paths, verify they are the same directory and exact-match the
   replayed authority/binding root, read the live branch and `HEAD`, and require
   exact matches to the replayed branch and schema-9 binding/authority head
   revision. Detached HEAD, aliases, observation errors, or drift fail closed.
6. Check root writability and each exact required capability through host
   observations performed during the load. Required capabilities must also be a
   subset of the active binding and Wheels Up authority. Missing, duplicate, or
   unavailable capabilities fail closed.
7. Construct exactly one root attestation, one writability attestation, and one
   attestation per required capability. Bind all attestations to one host,
   replayed executor/repository/root, the exact load time, and deterministic
   content-derived IDs. Use zero-duration freshness (`observedAt`, `expiresAt`,
   and context `evaluatedAt` equal) so a later authorization/execution lookup
   must reload live state rather than reuse a lease.
8. Validate the completed context with
   `validatePermissionInvocationContext` before returning `ready`. Return no
   partial context on any failure.
9. Expose a dedicated package subpath for the loader and its result types. Do
   not wire it into `mission-runtime-v1`, `local-tools`, or the #170 dispatch
   composition in this slice.
10. The loader is read-only. It must not append journal, audit, or control-event
    records; mutate the worktree; invoke a model or tool; or publish externally.

## Closed result taxonomy and precedence

The loader returns `ready` with the validated context or `blocked` with one
closed code and errors. Failures are resolved in this order:

1. `input_invalid` — malformed request, plan, decision, host, time, dependency,
   or duplicate capability input.
2. `journal_invalid` / `schema_unsupported` — missing, unreadable, malformed,
   mixed, legacy, or replay-invalid journal.
3. `mission_mismatch` / `revision_mismatch` / `sequence_mismatch` — plan does
   not exact-match replayed mission state.
4. `authority_missing` / `authority_inactive` — Wheels Up is absent, revoked,
   malformed, or no longer executable.
5. `binding_missing` / `binding_ambiguous` / `binding_invalid` — active May
   binding is absent, non-unique, malformed, stale, overbroad, or not exact-bound
   to Wheels Up.
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
- Update `packages/shield-team-system/package.json` with the explicit
  `./schema9-permission-context` export.
- Update `packages/shield-team-system/tests/package-surface.test.mjs` for the
  export, packed files, ESM import, and TypeScript surface.
- Add only this plan, reconnaissance, and existing mission brief under
  `docs/missions/`.

No edits to mission runtime, local model adapters, permission evaluation,
schema-9 authority/replay, audit store, May control store, CLI, or GitHub code
are authorized unless Fury identifies a concrete correctness requirement.

## Acceptance tests

- A durable schema-9 journal with active Wheels Up and one active May binding,
  exact live root/branch/HEAD, writable root, and available required
  capabilities produces one valid context whose identity and scope are wholly
  replay-derived.
- Restart/readback produces the same authority-bound fields while issuing fresh
  attestations; superseded binding versions never appear active.
- Missing, malformed, mixed-schema, legacy, stale-sequence, revoked,
  post-completion, missing-binding, ambiguous-binding, and overbroad state fail
  before live capability release or any effect.
- Symlink/aliased root, wrong Git top-level, detached/wrong branch, stale/wrong
  HEAD, failed Git observation, unwritable root, unavailable capability, and
  malformed capability observation fail closed.
- Branch or HEAD drift between loads is detected; no prior context is cached or
  reused.
- Caller input cannot substitute runtime, model, executor, repository, root,
  branch, artifact, authority, or binding identity.
- Context attestation cardinality, host/executor/repository/root binding,
  timestamps, IDs, and final permission validation are exact and deterministic.
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
