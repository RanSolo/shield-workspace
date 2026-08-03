# Issue #171 Slice B May blueprint — May control-event filesystem store

## Identity

- Mission: `mission:issue-171-slice-b`
- Slice: `issue-171-slice-b`
- Mission revision: `sha256:15OVRHWorBFCbQk8-2PjUwDjvpaFIYV4qSrRORjstn8`
- Branch: `agent/issue-171-control-events`
- Immutable code base: `081187204cf7ac3e57907a418a9e891119962740`
- Planning-head base: `520950fd887497efa37351c2df1898fa8b53c4c3`
- Status: planning/recon only; no production code changes

## Scope freeze

- Non-authoritative telemetry only. No authority, runtime-binding, dispatch, Slice C, #170, export map, model invocation, publication, merge, deployment, or external effects.
- Only Slice B is planned: durable per-session May control-event replay/readback/append-if-absent.
- Maximum implementation surface: source + tests only.

## PATH_SET (max two implementation paths)

1. `packages/shield-team-system/src/may-control-event-store.mts`
2. `packages/shield-team-system/tests/may-control-event-store.test.mjs`

No package export entry, no open/close API, and no batch sink in this slice.

## Closed API contract

1. `readMayControlEventLogV1(input)`
2. `appendMayControlEventIfAbsentV1(input)`
3. `createMayControlEventFilesystemStore(input)` returning `{ sessionId, read(): Promise<unknown>, appendControlEvent(event): Promise<unknown> }`

`appendControlEvent` compatibility requirement: append sink returns exactly `{ eventId: string, appended: true }` and event IDs are string.

## Exact contract points for durable replay

- `MayControlEvent` field set is exact and fixed: `mayControlEventSchemaVersion`, `authority`, `eventId`, `sessionId`, `code`, `counter`, `toolCallId`, `evidenceRefs`.
- `mayControlEventSchemaVersion` remains `1` and `authority` remains `non_authoritative`.
- `eventId` must be strict string form `may-control-event:${sessionId}:${counter}`.
- `counter` must be integer, session-scoped, and must start at `1`.
- `toolCallId` must be identifier-or-null and stored as-is.
- `evidenceRefs` must be a dense descriptor-safe array with exactly one entry equal to `may-control:${sessionId}`.
- Per-session storage is hash-confined: `.shield/may-control-events/<sha256(sessionId, base64url)>.jsonl` and sibling `.jsonl.lock` (no raw IDs in path names).

## Snapshot + canonical read rules

Before every async boundary:

1. Snapshot descriptor-safe input and event objects with strict plain-object/array shape validation.
2. Reject accessor properties, proxies, non-enumerable descriptors, sparse arrays, or mutable replacements.
3. Require exact input keys only.

Log replay is closed and never skips bad data:

4. `readMayControlEventLogV1` with missing file as valid empty read; an existing zero-byte file is invalid and treated as replay corruption.
5. Existing logs must be canonical JSONL with final newline; reject duplicate-key lines, noncanonical key order, malformed JSON, malformed `MayControlEvent`, empty lines, truncated final lines, and empty-file rows.
6. Replay all events in exact file order and reject mixed session, counter gaps/duplicates/regressions, `eventId`/session/counter mismatches, duplicate exact-event conflict shape, or non-local per-session scope.
7. No partial salvage and no tail truncation: any malformed tail returns invalid.

## Idempotency and conflicts

8. Exact idempotency: same `eventId` and exact event payload returns reconstructed receipt with existing index; no file mutation.
9. `same-eventId` + different payload => `may_control_event_id_conflict`.
10. `eventId` equality is used for session replay safety; event IDs are not numeric and never replaced.

## Concurrency, durability, and uncertainty

11. Locking must be exclusive and identity-checked via `wx`-style lock creation with owner marker, inode/device marker validation on release, and release only when the marker remains unchanged.
12. Append path writes exactly one canonical JSON line (`canonicalJson(event) + "\n"`) with full write and file sync.
13. If store is first created, sync directories in order before release: repository root after creating `.shield`, `.shield` after creating `.shield/may-control-events`, and the store directory after first log creation.
14. Always reread and compare expected bytes exactly after append.
15. After any uncertainty after lock acquisition, candidate replay, write, readback, or release verification, return `recovery_required` and never silently retry.
16. Close-store APIs throw by closed contract code and never return partial truthy values.

## Closed failure taxonomy and precedence

1. `malformed_input` — invalid field shape, non-safe descriptors, bad scope, bad identifiers.
2. `unsafe_path` — symlinked/non-regular repository, directory, log, or lock boundaries.
3. `may_control_event_lock_held` — lock unavailable at acquisition.
4. `may_control_event_unavailable` — pre-mutation FS failure without mutation evidence.
5. `may_control_event_replay_invalid` — malformed/replay-invalid/empty-file pre-existing data before mutation.
6. `may_control_event_id_conflict` — same eventId, different payload.
7. `may_control_event_sequence_violation` — duplicate/ gapped counter or regression before mutation.
8. `recovery_required` — short write/sync failures, post-write byte mismatch, lock owner drift, candidate replay ambiguity during mutation, or lock-release uncertainty.

Failure precedence is pre-validation first, then exclusivity/path, then deterministic replay validation, then append, then release verification.

## Test matrix and validation commands

Focus on `packages/shield-team-system/tests/may-control-event-store.test.mjs` then full package tests:

1. `npm --prefix packages/shield-team-system run build`
2. `node --test packages/shield-team-system/tests/may-control-event-store.test.mjs`
3. `npm --prefix packages/shield-team-system test`
4. `git diff --check`

Required test groups:

- missing file is empty read; `.jsonl` parent path is deterministic and hash-only,
- exact canonical replay with counter/eventId continuity,
- empty-line/noncanonical/malformed/truncated tail rejection without mutation,
- identical eventId idempotent reread with no byte growth,
- same-ID conflict rejection,
- foreign session replay rejection,
- lock contention, lock-owner mutation, and release-identity mismatch,
- short append, sync failure, reread mismatch => `recovery_required`,
- descriptor snapshot guardrails (proxies/accessor properties/mutable scope),
- toolCallId is preserved as descriptor-safe identifier-or-null through replay and duplicate handling.

## Rationale (local-packet error closures)

- No raw IDs in paths: session identity is hashed before log filename.
- No skipped malformed tail: invalid records fail-closed and preserve bytes.
- No invented `src/may-control-events/*.ts` files: path set is exact.
- No numeric receipt: receipt is exact `{ eventId: string, appended: true }`.
- No batch sink: only `appendControlEvent`-compatible single-event append-if-absent is exposed.
- No conflict-as-new-event: same-ID conflict is fail-closed, not appended.

## Key unresolved decisions for Fury

1. None (resolved): terminal and completion semantics are out of scope; ordering is only session, counter, eventId, and line order.
2. None (resolved): evidenceRefs validation is now fixed to exactly `["may-control:${sessionId}"]`.
