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

1. Canonical planning enters `classifyNativeIssueIntakePlanningJournal` through `prepareNext`. Production selects the repository observer `observeGitHubIssueV1` and the repository-owned `issueObservationWrapper` seam; dependency injection remains test-only, and no caller-supplied or out-of-band observation may enter the production command.
2. Ordinal `direct:1` invokes `observeGitHubIssueV1(issueRef, { cwd: root })`. The adapter projects the closed observer environment, invokes `defaultGitHubIssueByteRunner("gh", ["api", "graphql", ...])` once, and classifies that exact child result. A blocked direct result terminates before wrapper, consistency, downstream transition handlers, or journal mutation.
3. Only direct success reaches ordinal `wrapper:2`, which invokes `issueObservationWrapper(issueRef, directObservation, { cwd: root })` with the exact direct observation. The production default is the repository-owned identity wrapper; it may not invoke an out-of-band command, accept substituted bytes, or derive an outcome from the outer mission command. Wrapper failure terminates before consistency and downstream handlers.
4. Only wrapper success reaches ordinal `consistency:3`, where `issueObservationMatchesNativeIssueIntakeBinding` compares the exact wrapped observation with the journal's frozen `IssueIntakeSourceBindingV1`. Mismatch returns the existing `issue_observation_drifted` classification before downstream handlers; success alone may produce `planning_ready`.
5. Failure diagnostics bind actual stages and ordinals: direct failure is `direct:1 → error_mapping:2`; wrapper failure is `direct:1(success) → wrapper:2(wrapper_failed) → error_mapping:3(wrapper_failure_after_direct_success)`; consistency failure is `direct:1(success) → wrapper:2(success) → consistency:3(consistency_failed) → error_mapping:4(consistency_failed)`. The outer command may not synthesize, relabel, or overwrite any stage.
6. Direct adapter outcomes retain this closed precedence: invalid request/options; unavailable observer runner; unsafe projected environment; exact child-process exit classification (`authentication_failed`, `authorization_failed`, `rate_limited`, `timeout`, `not_found`, `network_failed`, then `host_rejected`); UTF-8/size/JSON validation; repository and issue identity; open-state and label shape; acceptance-criteria parsing. `network_failed` may be emitted only from the exact direct child-process result at `direct:1`. Existing redaction, timeout, environment isolation, strict response validation, and failure precedence remain unchanged.
7. The standalone direct `gh issue view` command is reproduction evidence only. It is never accepted as a production observation, wrapper result, substituted response, fallback input, or authority source.

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

The closed execution sequence is: Fury PASS on this exact plan; verification of the existing signed standing authority and its exclusions; terminal May implementation limited to the approved paths; Mack validation of the exact implementation revision; final Fury conformance review; then draft PR publication only. No implementation begins before plan PASS and standing-authority verification, and no draft publication occurs before Mack and final Fury PASS. Merge, deployment, release, final acceptance, credential/security expansion, destructive effects, and scope expansion remain excluded.
