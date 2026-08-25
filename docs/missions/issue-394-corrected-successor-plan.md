# Issue #394 — safe corrected successors for redacted Fury denials

## Exact planning identity

- Repository: `RanSolo/shield-workspace`
- Issue: `#394`
- Planning base: `68f68a9ea8fa4652f6bc96a9a057c25cee3bcd1d`
- Mission: `mission:issue-intake:uJZqpB8trZG10R-w2BuQXxu1QKVVGqo_xL5vQenuSZ8`
- Authority at freeze: `none`
- Proving predecessor: #386 receipt `receipt:WJiD4X5CNErr-M6fCpFXYRlstwGbBG54`; it is evidence input only and must never be replayed.

## Smallest bounded outcome

Extend the existing Fury admission projection with closed, non-sensitive search-path denial categories and a canonical correction hint that contains no raw path, query, session, or tool-call identifiers. Add one repository-owned operation that consumes the exact failed receipt and original request, revalidates unchanged repository/plan/session bindings, derives a fresh predecessor-bound successor request, and dispatches it once through the existing authority-none host.

The operation must preserve tools, effects, repository scope, plan, model/runtime/executor, authority, and execution semantics. Missing, malformed, stale, conflicting, ambiguous, already-consumed, or non-recoverable evidence fails closed; identical retry is idempotent and conflicting retry fails closed. The failed receipt is never replayed.

## Approved implementation and test scope

- `packages/shield-team-system/src/copilot-fury-plan-dispatch-core-v1.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`

Focused/affected Nx validation uses cache and excludes `@shield/multiband`. Tests reproduce #386 callback 23, verify redaction and closed hints, prove exact successor binding/idempotency/conflict rejection, and reach a terminal Fury verdict without replaying the predecessor.

## Explicit exclusions

No raw sensitive argument retention, capability or authority expansion, #386 mutation, receipt replay, merge, deployment, release, or final acceptance.
