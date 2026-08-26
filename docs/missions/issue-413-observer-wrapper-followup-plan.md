# Issue #413 — truthful canonical issue-observer wrapper failure

## Planning identity

- Issue: `#413`
- Follow-up: direct authenticated GitHub observation succeeds while canonical profile-aware intake returns `issue_observation_blocked: network_failed`.
- Planning base: `244be3097490ff0bc3a51ef65d57b41530d6f7c1`
- Authority: `none` planning artifact; no mission journal or CLI authority artifact exists.
- Repository: `RanSolo/shield-workspace`

## Observed reproduction

- Prepared clean lane: `/private/tmp/shield-flight-413-followup`.
- Direct `gh issue view 413 --repo RanSolo/shield-workspace --json number,title,body,updatedAt,url`: succeeds.
- Repository-owned `mission begin --profile-aware --issue github:RanSolo/shield-workspace/issues/413 --profile standard`: fails closed as `issue_observation_blocked: network_failed`.
- The same delta was reproduced for #367 after direct authenticated observation succeeded.

## Bounded outcome

Make canonical issue intake consume the truthful adapter observation when the authenticated direct GitHub observation succeeds, or return a closed wrapper-stage classification when the canonical wrapper call fails. Preserve the existing closed diagnostic vocabulary, call ordering, timeout, environment isolation, redaction, and failure precedence. A wrapper failure must never be relabeled `network_failed` solely because the outer mission command failed.

The implementation must observe and bind the actual child invocation result and stage, distinguish direct observation from wrapper/consistency failures, preserve `network_failed` only when emitted by the corresponding observed call, and keep handler non-invocation and fail-closed behavior. Identical replay remains deterministic and must not mutate a journal when intake is blocked.

## Approved paths

- `packages/shield-team-system/github/adapter-v1.mjs`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/tests/github-adapter-v1.test.mjs`
- `packages/shield-team-system/tests/cli.test.mjs`

## Acceptance criteria

- A direct authenticated observation that succeeds is represented as observed success with exact issue identity and criteria digests.
- A wrapper failure is represented by its actual closed reason and stage; it is never synthesized as direct `network_failed`.
- Actual `network_failed`, authentication, timeout, malformed-response, and wrapper failures retain existing precedence and redacted closed output.
- The wrapper invokes no downstream mission handler and does not create or mutate journal, authority, receipt, or publication artifacts on blocked intake.
- Focused tests cover direct-success/wrapper-failure separation, actual network failure, call order/environment binding, redaction, and byte-for-byte non-mutation/replay.
- Existing issue identity, Markdown criteria parsing, timeout, strict response, and replay contracts remain unchanged; #367 and #408 are untouched.

## Validation and exclusions

Use Node 22 with normal Nx cache enabled and lane-local workspace data. Validate focused adapter/CLI targets and affected targets as configured; Multiband is excluded. Fury reviews this exact plan, May implements only these paths after PASS, Mack validates the exact implementation revision, and Fury performs final conformance. Standing authority permits the bounded implementation and draft PR only after both reviews PASS; merge, deployment, release, final acceptance, credential/security expansion, and scope expansion remain excluded.
