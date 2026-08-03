# Local Daisy packet — issue #171 Slice B

Seat: Daisy, read-only recon. Mission revision: `sha256:15OVRHWorBFCbQk8-2PjUwDjvpaFIYV4qSrRORjstn8`. Exact base: `081187204cf7ac3e57907a418a9e891119962740`.

Objective: identify the smallest durable filesystem boundary for existing non-authoritative May control events. No implementation, authority design, Slice C, or #170.

Observed contract: `MayControlEvent` has exactly schema version 1, authority `non_authoritative`, `eventId`, `sessionId`, `code`, integer `counter`, nullable `toolCallId`, and `evidenceRefs`. `runMayControlLoop` calls `appendControlEvent(event)` and accepts only `{ eventId, appended: true }`. Event IDs are `may-control-event:${sessionId}:${counter}`; counters increase from 1. Current tests append to an in-memory array.

Available patterns: `permission-audit-store.mts` provides strict canonical per-ledger JSONL, confined paths, append-if-absent, lock/sync/readback, and closed recovery errors. `seat-dispatch-store.mts` provides one repository-scoped durable JSONL projection.

Return exactly:

1. `STORE_IDENTITY` — per-session or repository log, with rationale.
2. `REPLAY_INVARIANTS` — event validation, counter/code/tool-call ordering, idempotency/conflict rules.
3. `MINIMUM_API` — smallest read/append/adapter surface.
4. `FAIL_CLOSED` — at most six failure classes and uncertainty precedence.
5. `MISSING_EVIDENCE` — questions Fury must settle.

Do not invent symbols or claim edits/tests.
