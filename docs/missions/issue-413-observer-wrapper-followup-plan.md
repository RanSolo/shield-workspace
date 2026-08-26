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

## Frozen production call graph and precedence

1. `beginIssueIntake` selects only its repository-owned production observer, `observeGitHubIssueV1`; dependency injection remains test-only and no caller-supplied or out-of-band observation may enter the production command.
2. Observation ordinal `initial:1` invokes `observeGitHubIssueV1(issueRef, { cwd: root })`. That adapter must project the closed observer environment, invoke `defaultGitHubIssueByteRunner("gh", ["api", "graphql", ...])` once, and classify that exact child result. A blocked result terminates intake before compilation, downstream handlers, or journal mutation.
3. After the first observation succeeds, `beginIssueIntake` performs its existing configuration, binding-registry, prepared-receipt, and repository readback checks. For a fresh mission only, observation ordinal `consistency:2` invokes the same adapter again with the same issue reference and root. A blocked or non-identical second observation terminates before journal initialization.
4. The standalone direct `gh issue view` command is reproduction evidence only. It is never accepted as a production observation, substituted response, fallback input, or authority source.
5. Adapter outcomes retain this closed precedence: invalid request/options; unavailable observer runner; unsafe projected environment; exact child-process exit classification (`authentication_failed`, `authorization_failed`, `rate_limited`, `timeout`, `not_found`, `network_failed`, then `host_rejected`); UTF-8/size/JSON validation; repository and issue identity; open-state and label shape; acceptance-criteria parsing. `network_failed` may be emitted only from the exact child-process result classified at its actual ordinal. The outer mission command, wrapper exception, or later consistency failure must not synthesize or overwrite it.
6. Diagnostic output binds the actual ordinal and stage: `initial:1` maps with `initial`, `consistency:2` maps with `consistency`, and later consistency mismatch remains `issue_drifted`. Existing redaction, timeout, environment isolation, strict response validation, and failure precedence remain unchanged.

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

Use Node 22 with normal Nx cache enabled and lane-local workspace data. Validate focused adapter/CLI targets and affected targets as configured; Multiband is excluded.

The closed execution sequence is: Fury PASS on this exact plan; verification of the existing signed standing authority and its exclusions; terminal May implementation limited to the approved paths; Mack validation of the exact implementation revision; final Fury conformance review; then draft PR publication only. No implementation begins before plan PASS and standing-authority verification, and no draft publication occurs before Mack and final Fury PASS. Merge, deployment, release, final acceptance, credential/security expansion, and scope expansion remain excluded.
