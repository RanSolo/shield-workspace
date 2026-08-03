# Fury context capsule — issue #171 Slice B

- MISSION: `mission:issue-171-slice-b` at `sha256:15OVRHWorBFCbQk8-2PjUwDjvpaFIYV4qSrRORjstn8`; planning/recon only, non-authoritative telemetry, no implementation, Slice C, #170, export, model, or publication authority.
- EXACT_REVISION: HEAD `dfe35adf201c5e61fe3c672c64b2875e133dcff2`; blueprint SHA-256 `64e58471ffadf08093a0da732971812d4aaa3251e437932282f3b27b128d2587`.
- VERDICT: `FURY_REQUIRED_CHANGES`.
- UNRESOLVED: Freeze lifecycle/code/toolCallId uniqueness and terminal readback; classify persisted duplicates as replay-invalid, exact duplicate requests and gaps/regressions as sequence violations, same-ID/different-payload as ID conflict, and reserve exact two-field receipts for fresh appends; specify exact scope/API/result/missing-vs-zero-byte contracts without public/export changes; replace impossible proxy rejection with descriptor-safe snapshots; define full lock/directory/file durability with `recovery_required` overriding post-mutation/release uncertainty; require complete validation/replay/path/lock/sync/append/readback/release/adapter failure-injection coverage.
- NEXT_INPUT: A committed corrected `docs/missions/issue-171-slice-b-may-blueprint.md` on a new exact planning HEAD, with that HEAD and corrected blueprint SHA-256 supplied for rereview.
