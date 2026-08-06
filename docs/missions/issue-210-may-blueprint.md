# May blueprint — issue #210

Implement the Fury-approved `docs/missions/issue-210-plan.md` as one bounded
change. The existing signed `create_draft` request remains the authority; an
exact existing draft is only verified, never mutated, on resume.

## Writable paths

- `packages/shield-team-system/github/pr-workspace.mjs`
- `packages/shield-team-system/public/github.d.mts`
- `packages/shield-team-system/tests/github-pr-workspace.test.mjs`
- `packages/shield-team-system/tests/delivery-workspace.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`

## Acceptance checklist

- Derive create, update, or exact verification from durable request evidence
  plus host-observed PR state, with no caller switch.
- Exact-create resume verifies open draft state, repository/base/branch/HEAD,
  title, body, PR number, canonical URL, and receipt identity.
- Verification reports `verified_existing_draft_pr` and returns before every
  mutating command.
- Presentation or identity drift fails closed and requires separately
  authorized update authority.
- Existing create and explicit update behavior is unchanged.
- Delivery Workspace retains all independent post-await freshness checks and
  reaches `dispatch_ready` only after eligible durable Fury evidence and the
  current schema-9 projection.
- No review-publication, authority, journal, adapter, or dispatch redesign.

Return changed files, commands actually run, exact results, and unresolved
risks. Stop on any contradiction with the governing plan.
