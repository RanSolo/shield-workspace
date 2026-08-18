# Issue #322 — explicit Fury user card without repository card

## Revision and objective

- Planning base: `d92cff1a7ba08215262899d96c037bfae4620294`
- Issue: `github:RanSolo/shield-workspace/issue/322`
- Objective: allow the governed Copilot Fury adapter to select an exact digest-bound explicit user card when the target repository has no repository Fury card, while preserving fail-closed default selection, precedence evidence, and all existing card safety checks.

## Observed defect

`resolveCard()` unconditionally reads `.github/agents/fury.agent.md` from the exact repository HEAD before evaluating `cardSelection`. A repository without that path therefore returns `BLOCKED_ADAPTER_GAP` even when the request explicitly selects `user://agents/fury.agent.md` with its expected SHA-256.

## Acceptance criteria

1. Repository-card observation is a closed `present | absent` result bound to the literal replacement-disabled HEAD tree. `absent` is permitted only when exact-tree lookup proves that the literal path does not exist; invalid objects, repository corruption, command failure, ambiguous output, or any other lookup failure remains fail-closed before claim. A present repository card retains all existing parsing and Fury-seat checks before selection.
2. `repository_default` continues to fail closed before claim when the repository Fury card is absent.
3. `explicit_user_override` succeeds when the repository card is absent and the user card passes the existing logical-ref, digest, no-follow/canonical-path, parsing, and Fury-seat checks.
4. Successful absent-repository override evidence records the repository source as `absent` with `contentDigest: null` and records the user source as selected.
5. A missing, malformed, unsafe, wrong-seat, or digest-mismatched user override fails before claim or Copilot execution.
6. Existing repository-default, silent-shadowing, explicit-override-with-repository-card, replay, identity, and authority-none behavior remains unchanged.
7. The existing NXT-458 request can retry after this correction without rebuilding its signed mission, requesting another PIN, or adding SHIELD agent files to Asmark.

## Implementation surface

- `docs/missions/issue-322-explicit-user-card-plan.md` (this frozen plan only)
- `packages/shield-team-system/src/copilot-fury-plan-dispatch-v1.mts`
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`

No package, CLI, receipt, journal, authority, card-generation, or Asmark product path is changed.

## Validation

- focused Copilot Fury dispatch tests through the existing Nx target with normal cache, proving absent repository plus valid override success/evidence and execute-once replay; absent repository plus default selection fails before preflight, claim, execution, ledger, or audit effects; missing, malformed, wrong-seat, unsafe-path, and digest-mismatched user cards retain the same no-effect boundary; replacement refs cannot turn literal-HEAD absence into presence; and present-repository override plus silent-shadowing behavior remains unchanged;
- one exact base/HEAD Nx affected focused validation;
- exact changed-path, plan-digest, and clean-worktree checks;
- Mack exact-revision validation followed by Fury conformance review.

## Stops and exclusions

Stop if the correction requires a new card source kind, new authority, relaxed digest/path/seat checks, repository card installation in consumer repositories, or changes outside the three authorized paths. Do not execute NXT-458, publish, merge, deploy, release, or simulate human authority in this mission.
