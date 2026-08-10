# Issue #210 — effect-free exact-draft resume

## Mission binding

- Mission: `mission:issue-210`
- Mission revision: `sha256:BJGYiGeIUNe0ERZ1NtAJ8gv2r8cRiZEuCIqT5QAYoOc`
- Subject: `github:RanSolo/shield-workspace/issue/210`
- Planning base: `438458157dde681e66ce1deef116b455b24061bf`
- Branch: `agent/issue-210-effect-free-draft-resume`
- Mode: Delivery

## Problem

The #137 v5 proving mission used one authorized schema-9 `create_draft`
publication request. Its first Delivery Workspace call created draft PR #204
and correctly stopped at `workspace_ready` while Fury evidence was pending.
After exact-head Fury evidence became eligible, replaying that same request
failed with `publication_effect_mismatch`: `createOrUpdatePR(...)` inferred
`update_draft` solely because the draft now existed.

The resume needs no publication mutation. Requiring update authority for an
exact readback widens the effect contract and prevents the canonical
create → Fury review → resume → `dispatch_ready` sequence.

## Frozen design

### Host-observed resume classification

Resolve the durable publication request and observe matching pull requests
before selecting the execution path. Derive the path only from the request's
exact authorized effects and the host-observed PR state:

- no matching PR plus `create_draft`: preserve the existing create path;
- one matching open draft plus `update_draft`: preserve the existing update
  path;
- one matching open draft plus the replayed `create_draft`: enter exact,
  read-only verification;
- every other combination fails closed as it does today.

No caller option, boolean, authority class, requested effect, journal schema,
or publication operation is added. The verification path evaluates the
original create publication scope; it does not rewrite it as update authority.

### Exact draft verification

Extend the existing `gh pr list` observation to include the draft body. The
read-only resume requires exactly one matching pull request and verifies:

- repository, base branch, head branch, and exact HEAD;
- open and draft state;
- exact title and exact body;
- positive PR number and canonical repository PR URL; and
- the existing receipt fields and artifact revision.

Title or body drift fails with a specific closed reason before any mutation.
Closed, non-draft, ambiguous, wrong-base, stale-head, malformed, or
non-canonical receipt evidence remains blocked. A drifted draft is never edited
under create authority; an independently authorized `update_draft` request is
required.

### Zero-effect return

After authority, scope, live-base, and exact-draft checks succeed, return the
existing reusable result state with truthful action
`verified_existing_draft_pr`. Return before `git push`, `gh pr create`, or
`gh pr edit`. The command trace may contain only read-only Git and GitHub
observations.

Delivery Workspace continues its independent receipt validation, Fury evidence
evaluation, schema-9 projection load, and final journal, PR, Fury, and dispatch
receipt readbacks. It only learns the additional truthful publication action;
its authority and dispatch decisions are unchanged.

### Compatibility

- Preserve absent-PR create behavior and `created_draft_pr`.
- Preserve explicitly authorized existing-PR update behavior and
  `updated_existing_draft_pr`.
- Preserve absent-PR update rejection.
- Preserve publication candidates, receipts, scope bindings, and all
  post-await freshness checks.
- Add only `verified_existing_draft_pr` to the public Delivery Workspace action
  union.

## Exact implementation scope

May may modify only:

1. `packages/shield-team-system/github/pr-workspace.mjs`
2. `packages/shield-team-system/public/github.d.mts`
3. `packages/shield-team-system/tests/github-pr-workspace.test.mjs`
4. `packages/shield-team-system/tests/delivery-workspace.test.mjs`
5. `packages/shield-team-system/tests/package-surface.test.mjs`

Planning artifacts are immutable during implementation.

## Required tests

- one schema-9 `create_draft` request first creates a draft and returns
  `workspace_ready`, then verifies that exact draft and reaches
  `dispatch_ready` after durable Fury evidence;
- the second call returns `verified_existing_draft_pr` and invokes no
  `git push`, `gh pr create`, or `gh pr edit`;
- exact title, body, HEAD, and base drift each block before effects;
- closed, non-draft, ambiguous, malformed, and non-canonical PR evidence stays
  fail closed;
- explicitly authorized updates still update, while absent-PR updates remain
  blocked;
- existing create, update, publication-candidate, post-await readback, and
  package-surface tests remain passing.

## Validation

Run without filtering failures:

```text
npm run build --workspace @shield/team-system
node --test packages/shield-team-system/tests/github-pr-workspace.test.mjs
node --test packages/shield-team-system/tests/delivery-workspace.test.mjs
node --test packages/shield-team-system/tests/review-publication-v1.test.mjs
node --test packages/shield-team-system/tests/package-surface.test.mjs
npm test --workspace @shield/team-system
npm pack --workspace @shield/team-system --dry-run
git diff --check
```

## Stop conditions

Stop on any required push, create, or edit during exact-create resume; caller
asserted resume state; effect widening; mutation under create authority;
weakened PR identity or presentation checks; lost Delivery Workspace readback;
public API expansion beyond the action literal; or need to modify a path
outside the five authorized files. Do not implement or dispatch #137, run its
external fixture, enter #29, merge, deploy, or release.
