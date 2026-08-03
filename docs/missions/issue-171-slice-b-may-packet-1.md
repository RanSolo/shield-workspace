# Local May packet — issue #171 Slice B

Seat: May, blueprint challenge only. Exact base `081187204cf7ac3e57907a418a9e891119962740`; mission revision `sha256:15OVRHWorBFCbQk8-2PjUwDjvpaFIYV4qSrRORjstn8`. No implementation.

Frozen facts:

- Existing `MayControlEvent` fields are `mayControlEventSchemaVersion`, `authority`, `eventId`, `sessionId`, `code`, `counter`, nullable `toolCallId`, and `evidenceRefs`.
- The loop requires `appendControlEvent(event)` to return exactly `{ eventId, appended: true }`.
- Events are non-authoritative telemetry; counters and derived IDs are contiguous from 1.
- Missing log may mean empty. Any existing empty, malformed, duplicate-key, noncanonical, truncated, mixed-session, gapped, conflicting, or uncertain log fails closed; never skip a tail.
- Confine per-session files under `.shield/may-control-events/` using a hash of `sessionId`, never raw IDs.
- Reuse Slice A durability semantics: exclusive verified lock, full write, file/directory sync, exact reread, append-if-absent, uncertainty as `recovery_required`.
- Do not infer code taxonomy beyond the current closed event fields; do not enter Slice C or #170.

Return exactly four short sections:

1. `PATH_SET` — maximum two implementation/test paths.
2. `API` — only read, append-if-absent, and sink factory signatures.
3. `REPLAY` — minimum invariants and idempotency/conflict behavior.
4. `TESTS_AND_RISKS` — eight highest-value cases and at most three unresolved Fury decisions.

No code, invented exports, or authority claims.
