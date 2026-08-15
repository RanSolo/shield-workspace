# Issue #306 prerequisite — hidden-path implementation authority hotfix

## Exact context

- Repository: `RanSolo/shield-workspace`
- Parent issue: #306
- Base revision: `92d7f90a1ceb76f549af62dde944fca5bb45f168`
- Trigger: `mission authorize-wheels-up` rejects otherwise valid
  `approvedRelativePaths` beginning with `.codex/` or `.shield/` as
  `Implementation authority scope is malformed`.

## Root cause

`validateImplementationAuthorityPayload()` and
`validateSchema9RuntimeBindingV1()` both validate `approvedRelativePaths` with
the generic sorted-identifier helper before their path-specific checks. The
identifier grammar requires an alphanumeric first character, so valid
repository-relative hidden paths can never reach `assertRelativePath()` in
either the implementation authority or its schema-9 runtime binding.

## Bounded correction

1. Add a sorted, unique, plain-array string helper whose item predicate is
   `assertRelativePath`, and use it for `approvedRelativePaths` in both
   validators.
2. Preserve the identifier helper for actions, effects, capabilities, and
   validation command IDs.
3. Add focused implementation-authority and schema-9 runtime-binding
   regressions proving sorted `.codex/...` and `.shield/...` paths validate,
   while absolute paths, dot segments, duplicates, and unsorted inputs still
   fail closed in both contracts.
4. Rebuild the existing Team System package, then resume #306 with a fresh
   exact authority packet. Do not weaken path confinement or authorize #306
   implementation under this prerequisite mission.

## Exact implementation scope

- `packages/shield-team-system/src/implementation-authority-v1.mts`
- `packages/shield-team-system/tests/schema9-implementation-authority.test.mjs`

## Validation

- focused implementation-authority tests;
- `npm exec nx -- run @shield/team-system:build --skipNxCache`;
- `git diff --check`.

Stop after exact-head Mack/Fury review. No #306 product implementation,
publication, merge, deployment, release, or final acceptance is authorized.
