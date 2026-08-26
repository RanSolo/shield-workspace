# Issue #407 — additive issue-observation stage diagnostic plan

## Non-canonical planning context

- Repository: `RanSolo/shield-workspace`
- Clean planning base: `2064108a6f5e93fa17830b5d819782d5b2d20a46`
- Subject: `github:RanSolo/shield-workspace/issue/407`
- Direct observation issue revision: `sha256:KUCYUIUlXpamn24dbvoGAScqQ4YVCeiv3LHOmtWSLKk`
- Acceptance-criteria digest: `sha256:fc68f383ee0932d17c869e0db1fee10d9fb7ac920ddb98e5ff1015862d52f94e`
- Canonical mission: none; no journal exists or is created by this plan.
- Authority: `none`.

## Objective

Add the smallest closed diagnostic identifying whether a blocked profile-aware
issue observation occurred during the `initial` observation or the
`consistency` re-observation. Preserve all admission, observation, and journal
semantics.

## Bounded correction

1. Keep the existing two-observation sequence and all existing issue identity,
   revision, acceptance-criteria, repository, and prepared-worktree checks.
2. When either observer call returns a blocked result, attach only the closed
   stage value `initial | consistency` and the existing closed reason value.
3. Preserve the existing `issue_observation_blocked: <reason>` compatibility
   surface; the additive diagnostic may be exposed only as structured safe
   metadata or an equivalent closed result projection.
4. Never retain or expose tokens, environment values, GraphQL text or
   variables, issue body/title, absolute credential paths, raw stderr, or other
   adapter payloads.
5. Preserve zero journal mutation on every blocked observation and preserve
   exact replay/idempotency behavior.

## Focused regression coverage

- Initial-stage network, authentication, and timeout failures carry
  `stage=initial` and preserve the existing reason.
- Consistency-stage network, authentication, and timeout failures carry
  `stage=consistency` and preserve the existing reason.
- Successful two-observation intake and observation mismatch remain unchanged.
- Safe-field assertions prove no secret, raw error, query, issue content, or
  absolute path enters the diagnostic.
- Blocked intake leaves the journal absent and does not create provenance.

## Approved paths and exclusions

Approved implementation/test paths are only:

- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`

Planning artifacts are the only files changed before a later human
implementation decision. Exclude issue mutation, canonical intake replay,
mission creation, authorization, implementation, publication, merge,
deployment, release, and final acceptance.
