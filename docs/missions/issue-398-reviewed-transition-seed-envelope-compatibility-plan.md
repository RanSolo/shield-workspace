# Issue #398: Reviewed-transition seed-envelope compatibility

## Frozen mission context

- Mission: `mission:issue-intake:euS55Ob6cV-EsKE3iKix1JowOz9C18r7E0h6t2RBasA`
- Subject: `github:RanSolo/shield-workspace/issue/398`
- Repository: `RanSolo/shield-workspace`
- Planning base and current HEAD: `35d5ea49f2af9ebe1f674aa60d642b6939441fbe`
- Branch: `agent/issue-398-seed-envelope-compat`
- Related issues: #396, #341, #394

## Observed failure

The canonical corrected-successor rail was given the durable seed emitted by
`mission prepare-reviewed-transition`:

`.shield/audit/copilot-fury-reviewed-transition/82b9afca629f3880c425a76fe40cc8eb762a4aa935090299228a400d3b12163a/request-seed.json`

with predecessor receipt
`receipt:4KRxtg23QqvUkXnArnl8TEVoU5wDcH_k`. The command returned
`MALFORMED_REQUEST` with `Request fields are not closed.` The seed is a closed
`shield.copilot-fury-reviewed-transition-seed.v3` envelope whose closed inner
request is under `request`; the corrected-successor input validator expects the
inner request shape directly. No successor receipt or evidence was emitted,
and the failed receipt was not replayed.

## Smallest bounded change

Add one repository-owned authority-none compatibility adapter at the existing
corrected-successor dispatch boundary. It accepts either the existing direct
closed request or the exact closed `shield.copilot-fury-reviewed-transition-seed.v3`
envelope, extracts the nested request in memory, and sends the canonical inner
request through the existing successor path. It must verify before preflight:

1. The envelope and nested request are closed, exact-schema values with no
   unknown fields.
2. Envelope bindings match the nested request and the current mission,
   subject, repository, prepared-worktree receipt, branch, HEAD, transition
   plan, and predecessor receipt supplied by the canonical rail.
3. The predecessor receipt is consumed only as an immutable predecessor input;
   no durable evidence is rewritten and no failed receipt is reinvoked.
4. Any malformed, stale, conflicting, ambiguous, or already-consumed input
   fails closed before model invocation or successor emission.

The adapter must not invent raw arguments, authority, model/runtime/executor
identity, capabilities, transition effects, or a new recovery contract. It
must not alter #396 implementation scope or broaden #386.

## Files and focused validation

The expected bounded surfaces are:

- `packages/shield-team-system/src/copilot-fury-plan-dispatch-core-v1.mts`
- `packages/shield-team-system/src/mission-cli.mts`
- `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`

Add focused tests proving exact v3 envelope acceptance, unchanged direct
request behavior, rejection of unknown or mismatched envelope/nested fields,
preflight-before-invocation failure, idempotent no-replay behavior, and
preservation of the original predecessor evidence bytes. Tests must run at the
exact plan revision and may use only synthetic redacted fixtures.

## Explicit exclusions

No implementation of #396, no raw-argument recovery, no evidence rewrite, no
failed-receipt replay, no authority or capability expansion, no new mission or
recursive rail-fix dispatch, no GitHub publication, merge, deployment, release,
or final acceptance.

## Authority-none handoff

This document is a non-authoritative Hill plan for Fury technical review. May
runtime/model/executor, if later admitted by a separate human gate, must be
derived from canonical repository configuration and the `.codex/agents/may.toml`
contract. Fury review does not grant implementation authority.
