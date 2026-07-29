# Issue #112 agent handoff

This is the Hill-owned mission checkpoint for Issue #112. Specialist runtimes
may read it but do not update it directly. They return bounded findings to Hill,
and Hill records accepted facts without rewriting their meaning.

This artifact exercises the file-backed handoff direction tracked by Issue
#119. It is mission state, not reusable specialist knowledge; reusable patterns
belong under the field-guide work tracked by Issue #79.

## Binding

- Repository: `RanSolo/shield-workspace`
- Branch: `codex/issue-112-v0.3-review-supersession`
- Mission base: `23d08989258ca0441d80f112926f8fb5001289f7`
- Verified implementation revision: `ad95724a92ef152e784f45d3d4e7da7a96a5bb51`
- Review surface: draft PR #125

The implementation revision identifies the tested code checkpoint before this
handoff file was added. The trusted host must supply the current exact PR head
to every subsequent review; this file must never be used to infer that value.

## Authority and gates

Option A is authorized: additive, backward-compatible supervised journal v7
implementation for Issue #112.

Not authorized:

- merge, deployment, or release;
- Issue #113 publication-effect enforcement;
- unrelated cleanup or scope expansion;
- autonomous Coulson, Fitz, or Simmons decisions.

Fury is a dispatchable architecture-review seat. Fitz is a human technical
gate reached through the draft pull request; Fitz is never dispatched or
simulated.

## Architecture decision

- Journal v7 is an additive superset of v6; v2-v6 are not rewritten.
- The immutable mission-plan revision remains distinct from the current
  repository-artifact review revision.
- `subject.revision_superseded` records explicit A→B transitions.
- B-bound Fitz and optional Simmons requirements name their exact superseded A
  requirements.
- Superseded requirements, stale human evidence, stale Fury records, and review
  revision history remain append-only.
- Exactly one final Fury record is allowed per review revision.
- Current-head Fury approval is required before routing to the Fitz human gate
  or accepting Fitz/Simmons evidence.
- v7 carries v6 runner, runtime-binding, and permission semantics without
  widening authority.

## Implemented scope

- `packages/shield-team-system/src/mission-v2.mts`
- `packages/shield-team-system/src/runner-supervision-shared-v1.mts`
- `packages/shield-team-system/src/runner-v1.mts`
- `packages/shield-team-system/src/permission-v1.mts`
- focused lifecycle, runner, permission, integration, and package-surface tests
- `PUBLIC_API.md`, `SUPERVISED_MISSION.md`, and `PERMISSION_BOUNDARY.md`

## Evidence

- Full `@shield/team-system` suite: 304 passed, 0 failed.
- Packed declarations and external strict TypeScript consumer: passed.
- Local Daisy produced a runner/permission schema-guard map; Hill corrected its
  v6 lower-bound and boolean-guard mistakes before implementation.
- Local May performed an exact-diff adversarial review and returned `PASS`.
  This is non-authoritative implementation feedback, not a Fury or human-gate
  verdict.

## Current state and next route

1. Commit and push this handoff-only addition.
2. Bind Fury to the new exact PR head for architecture review.
3. If Fury returns `CHANGES_REQUIRED`, route bounded corrections to May and
   repeat exact-head validation.
4. If Fury returns `PASS`, stop at the human Fitz gate in draft PR #125.

The branch must not change while an exact-head Fury review is active.
