# Issue #390 — durable interrupted Fury dispatch recovery

## Exact context

- Repository: `RanSolo/shield-workspace`
- Planning base: `b62a18d1047027d80249504cb01659cadcff010c`
- Subject: `github:RanSolo/shield-workspace/issue/390`
- Scope: recover an exact existing Fury dispatch from durable receipt/session
  state after a bounded host interruption; no new dispatch and no authority
  semantics expansion.

## Bounded implementation

May will update only the existing Fury dispatch host/core behavior so an
interrupted exact receipt records closed, non-sensitive session state and an
exact replay reobserves that state. Active sessions remain nonterminal with a
deterministic retry action; completed sessions return the durable terminal
handoff; failed or cancelled sessions return their exact closed failure
classification; uncertain or stale/conflicting state fails closed. The exact
receipt identity remains bound to repository, mission, plan digest, model,
runtime, executor, and policy. Replay never reinvokes Fury or fabricates a
verdict, handoff, authority, or human decision.

## Focused tests

Add production-faithful deterministic tests for the #387-shaped bounded wait:
timeout preserves the original receipt, immediate exact replay observes an
active session as pending with retry guidance, and a later durable completed,
failed, or cancelled state is projected without sleeping for the full timeout.
Cover late, stale, wrong, duplicate, and conflicting evidence as closed
failures. Keep all projections non-sensitive and preserve the existing
permission, capability, and authority-none exclusions.

## Approved paths

- `packages/shield-team-system/src/copilot-fury-plan-dispatch-core-v1.mts`
- `packages/shield-team-system/src/copilot-fury-reviewed-transition-host-v1.mts`
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`
- `packages/shield-team-system/tests/copilot-fury-reviewed-transition-host-v1.test.mjs`

## Validation and exclusions

Use affected and focused Nx validation with cache enabled and exclude
`@shield/multiband`; run `git diff --check` on the exact implementation
revision. No new tool or capability, authority change, model-facing network
or MCP access, publication effect, merge, deployment, release, or final
acceptance is authorized. Draft PR creation is permitted after independent
Mack validation and hosted Fury conformance review.
