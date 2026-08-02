# Issue #171 Fury architecture review

## Review identity

- Reviewer seat: Fury
- Exact reviewed revision: `54c7ac0a1a028d4a20096281a62a41e59265334f`
- Base revision: `b8bba50510423591fa5e1e6d874c8176ea162353`
- Verdict: `FURY_REVISE`
- Authority: technical architecture review only

## Architecture disposition

1. Slice A, a filesystem permission-audit store, is independently implementable first.
2. Slice B, a filesystem May control-event store, is independently implementable after its event contract is frozen.
3. Slice C cannot create an authoritative active-binding source inside #171. A separate binding store would duplicate the journal authority boundary; audit, control, dispatch, and model/runtime receipts are downstream or observational evidence and cannot authorize a pre-effect binding.
4. The eventual supported route requires separately reviewed prerequisites: a canonical schema-9 extension reusing v6-v8 `RuntimeBinding`, signed authorization, supersession, and active projection semantics; plus a positive typed implementation-authority producer for exact Wheels Up evidence. #171 may compose those only after they exist.
5. Keep #171 as one mission with small serial PR slices. Audit storage is first because durable invocation-claim semantics precede tool effects.

## Required Slice A invariants

- Reconstruct receipts from validated records and zero-based ledger position; do not persist receipt entries.
- Validate the candidate and exact configured `ledgerId` before mutation.
- Use repository confinement, no-follow regular-file checks, exclusive lock ownership, canonical newline-terminated JSONL, full replay, file and parent-directory sync, and exact post-write reread.
- Never skip malformed, duplicate-key, noncanonical, incomplete, foreign-ledger, or replay-invalid data.
- An existing canonically identical `recordId` and digest returns its reconstructed receipt without writing. Same-ID/different-content and replay conflicts fail closed.
- Uncertain write, sync, lock-release identity, or readback returns `recovery_required`; never blindly retry.
- Tests cover restart recovery, exact idempotency, conflicting duplicates, malformed tails, path escape/symlink, lock contention, partial writes, sync/readback failure, and invocation/result ordering.

## Required Slice B invariants

- Validate exactly the eight existing event fields.
- Counter is session-scoped, starts at 1, and is contiguous.
- Event ID is `may-control-event:${sessionId}:${counter}` and evidence references are exactly `["may-control:${sessionId}"]`.
- Tool-call identity is non-null only for the two tool-completion codes and unique per session.
- Reject all duplicates and all events after a terminal event.
- Provide exact session readback in counter order with terminal state.
- Apply Slice A durability and recovery rules; telemetry stays non-authoritative.

## Required correction

May must produce an exact Slice A implementation blueprint with paths, APIs, storage layout, closed outcomes, replay and failure precedence, test matrix, and validation commands. Slice C must remain blocked on separately reviewed authority prerequisites.

Mack exact-revision validation is required by repository workflow but is a validation attachment outside the V0.3 Mission Brief participant registry; it cannot supply or replace human evidence.
