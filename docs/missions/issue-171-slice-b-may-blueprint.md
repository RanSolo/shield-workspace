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
- Only Slice B is planned: durable per-session May control-event replay/readback/append-if-absent behavior.
- Maximum implementation surface remains source + tests only.

## PATH_SET (max two implementation paths)

1. `packages/shield-team-system/src/may-control-event-store.mts`
2. `packages/shield-team-system/tests/may-control-event-store.test.mjs`

No package export entry, no public declaration changes, no open/close API, and no batch sink in this slice.

## Exact API and type surface (closed)

1. `readMayControlEventLogV1(input)`
2. `appendMayControlEventIfAbsentV1(input)`
3. `createMayControlEventFilesystemStore(input) -> { sessionId, read(), appendControlEvent(event) }`

Primitive append contract remains `appendMayControlEventIfAbsentV1`. The store factory must expose `appendControlEvent(event)` only; it must not expose `appendIfAbsent`.

`appendControlEvent(event)` is exactly `MayControlLoopDependencies.appendControlEvent(event)` compatible:
- Input contract is one `MayControlEvent` object.
- Adapter return is exactly `{ eventId: string, appended: true }`.
- No existing index, sequence counter, or alternate receipt fields.

Closed primitive envelope shape:
- Valid: `{ state: "valid", value: T }`
- Invalid: `{ state: "invalid", code: <closed-taxonomy-string>, errors: readonly string[] }`
- No mixed fields, no partial values, and no index-like receipt fields.

Factory handle behavior:
- `read()` resolves to the primitive `value` (read result), not the envelope.
- `appendControlEvent(event)` resolves exactly to `{ eventId: string; appended: true }`.
- On any primitive `invalid` result from `read` or append, both handle methods throw `MayControlEventStoreError` with the same closed `code` and do not return partial/receipt-like data.
- Factory input-validation failures throw `MayControlEventStoreError` with the same closed taxonomy `code`.

Scope identity for all public surfaces is fixed to:
- `repositoryRoot` and `sessionId` for `readMayControlEventLogV1`.
- `repositoryRoot`, `sessionId`, and `lockOwnerId` for `appendMayControlEventIfAbsentV1` and `createMayControlEventFilesystemStore`.

Exact inputs:
- `readMayControlEventLogV1({ repositoryRoot, sessionId })`
- `appendMayControlEventIfAbsentV1({ repositoryRoot, sessionId, lockOwnerId, event })`
- `createMayControlEventFilesystemStore({ repositoryRoot, sessionId, lockOwnerId })`

## Identifier and event grammar (exact)

`IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/@#-]{0,511}$/u`

`MayControlEvent` is exact:
- `mayControlEventSchemaVersion`: number literal `1`
- `authority`: literal `non_authoritative`
- `eventId`: `string`
- `sessionId`: `IDENTIFIER`
- `code`: `string`
- `counter`: safe positive integer
- `toolCallId`: `IDENTIFIER | null`
- `evidenceRefs`: dense, descriptor-safe array

`evidenceRefs` is exactly one entry: `may-control:${sessionId}`.

`eventId` is strict string form `may-control-event:${sessionId}:${counter}`.

Reserved lifecycle codes:
- `may_control_started`
- `may_control_writeFile_completed`
- `may_control_runValidation_completed`
- `may_control_completed`

Per-session log path is exact:
- `.shield/may-control-events/${sha256(sessionId).toString("base64url")}.jsonl`
- sibling lock: `.jsonl.lock`

Using raw session text in paths is disallowed.

Read result fields are exact and closed:
- `logPath: string`
- `orderedEvents: readonly MayControlEvent[]`
- `terminalState: { state: "none" } | { state: "terminal"; code: string; counter: number; eventId: string; index: number }`
- `bytes: string`
- `missing: boolean`

Append result fields are exact and closed:
- `logPath: string`
- `byteLength: number`
- `bytes: string`
- `orderedEvents: readonly MayControlEvent[]`
- `terminalState: { state: "none" } | { state: "terminal"; code: string; counter: number; eventId: string; index: number }`
- `receipt: { eventId: string; appended: true }`

## Lifecycle projection and terminal rules (must match current emitter behavior)

Emitter-allowed `code` values that are non-terminal:
1. `may_control_started`
2. `may_control_writeFile_completed`
3. `may_control_runValidation_completed`

Success terminal:
- `may_control_completed`

Error terminals are any other boundedError grammar codes (excluding reserved lifecycle codes) and must satisfy:
- `/^[a-z][a-z0-9_]{0,127}$/u`
- Validation is strict, with no normalization of received code strings.
- Reserved lifecycle codes are disjoint and excluded from error-terminal classification.

Lifecycle rules:
- Exactly one `may_control_started` event unless setup fails before loop startup.
- `may_control_writeFile_completed` and `may_control_runValidation_completed` require a prior `may_control_started`.
- `may_control_completed` requires a prior `may_control_started` and at least one prior `may_control_runValidation_completed` in the same session.
- Error terminal events are permitted only as the first event when setup fails before startup, or as a single terminal event after active loop behavior has started.
- Exactly one terminal is allowed per session; once terminal, no later events are valid.
- `toolCallId` is non-null only for `may_control_writeFile_completed` and `may_control_runValidation_completed`, and these `toolCallId` values must be unique across the session.
- `toolCallId` must be null for all other event codes.
- Readback must expose terminal state exactly from canonical read ordering; it never grants authority.

## Snapshot, parse, and structural validation

- Snapshot scope and event objects before first async boundary.
- Reject reflective shape failures, accessors, non-enumerable descriptors, symbol keys, getters/setters, non-plain objects, and unsafe prototypes.
- Reject sparse arrays and non-dense descriptors.
- Reject malformed UTF-8 when reading bytes.
- Reject extra/missing/`undefined` fields and descriptor substitutions.
- Reject cycles via snapshot recursion.
- Validate counters as safe positive integers.
- Reject code strings not in disjoint lifecycle classes or non-structurally-bounded terminal form.

## Replay and read rules

- Missing file is valid empty read: `{ missing: true, orderedEvents: [], bytes: "", terminalState: { state: "none" } }`.
- Existing zero-byte file is invalid replay evidence: `may_control_event_replay_invalid`.
- Existing logs must be canonical JSONL with final newline and no empty lines.
- Reject duplicate JSON keys, malformed UTF-8, malformed strict JSON, duplicate-key maps, noncanonical line shape, and noncanonical bytes via byte-for-byte `canonicalJson(event)`.
- Reject inexact/incomplete final line (`\n` required).
- Replay is full and non-salvage; any bad tail invalidates the whole read.
- Reject cross-session events (session mismatch).
- Reject counter gaps, counter regressions, duplicated counters, and duplicated eventIds/counter pairs as replay failures.
- For persisted log content violations (including duplicated eventId/counter pairs): `may_control_event_replay_invalid`.

## Append semantics (no append idempotency)

- No file mutation is allowed for exact duplicate requests.
- Exact duplicate append request for same `eventId` and same payload after deterministic replay must fail as `may_control_event_sequence_violation`, with unchanged bytes returned in readback checks.
- Same `eventId` with different payload is `may_control_event_id_conflict`.
- Counter/gap/regression prewrite violations are `may_control_event_sequence_violation`.
- Fresh primitive append returns the full append result fields above.
- `appendControlEvent(event)` returns only `{ eventId:string, appended:true }`.

## Concurrency, durability, and precedence (exact)

Mutation sequence and precedence:
1. Snapshot and validate scope + candidate, then resolve paths.
2. Create and sync directories with uncertainty:
   - create `.shield` then sync repository root
   - create `.shield/may-control-events` then sync `.shield`; pre-existing safe directories are read-only at this point and do not imply mutation uncertainty.
3. Acquire lock with `O_EXCL` + `O_NOFOLLOW` and strict owner-marker write.
4. Open marker, write full marker, `sync` marker, and capture lock path `inode` and `dev` for release.
5. Sync lock parent directory.
6. Replay current file (unless missing).
7. Reject deterministic replay/sequence/id-conflict failures only if mutation path is otherwise clean.
8. Append full canonical line (`canonicalJson(event) + "\\n"`), full write, and log `sync`.
9. Sync first-log parent directory after first log creation.
10. Reread log, exact byte compare against expected bytes.
11. Verify marker/inode/dev stability and unlink marker only after verification.
12. Sync lock parent directory after verified unlink.

Uncertainty closure:
- Any uncertainty after mutation (`marker` write/sync, append/write, reread, marker drift, release unlink drift, release directory sync) returns `recovery_required` and overrides narrower outcomes.
- First lock-parent sync failure, verified unlink failure, and second lock-parent sync failure are `recovery_required`.
- They override deterministic outcomes because lock-namespace mutation occurred.
- Deterministic prewrite sequence/conflict results are only returned when release verification succeeds.

`lockOwnerId` and `repositoryRoot` constraints:
- `lockOwnerId` is non-empty, uses `IDENTIFIER` grammar, and max length is 128.
- `repositoryRoot` resolves to an absolute real path, is a non-symbolic writable directory, and is readable.
- Path checks use no-follow and canonical-confined semantics.

## Closed failure taxonomy and precedence

1. `malformed_input` — malformed scope/event shape, unsafe descriptors, bad identifiers.
2. `unsafe_path` — symlink/non-regular repository, `.shield`, store directory, log, or lock.
3. `may_control_event_lock_held` — lock unavailable at acquisition.
4. `may_control_event_unavailable` — pre-mutation FS read/write uncertainty without prior log mutation.
5. `may_control_event_replay_invalid` — malformed/replay-invalid/zero-byte preexisting data before mutation.
6. `may_control_event_id_conflict` — same `eventId`, different payload.
7. `may_control_event_sequence_violation` — duplicate exact event request, counter gaps, regressions, duplicates before mutation.
8. `recovery_required` — write/sync/reread uncertainty, lock ownership uncertainty, identity drift, release uncertainty, or any mutation path uncertainty.

Validation precedence is: malformed/input shape, unsafe-path, lock, replay/relation conflicts, then uncertainty override, then release verification.

## Validation commands

1. `npm --prefix packages/shield-team-system run build`
2. `node --test packages/shield-team-system/tests/may-control-event-store.test.mjs`
3. `npm --prefix packages/shield-team-system test`
4. `git diff --check`

## Expanded Fury test matrix

- missing vs zero-byte log behavior, including hash-only deterministic path (`base64url sha256(sessionId)`) and `.jsonl` sibling lock path.
- descriptor-safe `MayControlEvent` and scope snapshots: all fields required, missing fields, extra fields, unsafe descriptors, proxies, symbols, and mutability races.
- strict UTF-8 enforcement, noncanonical JSON, duplicate JSON keys, malformed JSON, malformed line shape, empty lines, truncated tail.
- lifecycle and terminal projection:
  - disjoint lifecycle-code class coverage: reserved lifecycle, boundedError terminal, and terminal-exclusion checks
  - tool completion before `may_control_started` rejection
  - one-time start rules,
  - no completion before successful setup,
  - completion requires at least one validation completion,
  - terminal-before-start setup case,
  - terminal-after-terminal rejected by replay.
- toolCallId behavior: required identifier for completion codes, uniqueness and nullability on all other codes.
- duplicate classifications:
  - persisted duplicate eventId/counter => `may_control_event_replay_invalid`,
  - exact duplicate append request => `may_control_event_sequence_violation` with unchanged bytes,
  - same eventId different payload => `may_control_event_id_conflict`.
- wrapper invalid-result behavior: every invalid primitive `read`/append result throws `MayControlEventStoreError` with code-only payload (no partial object data).
- foreign-session collisions and cross-session replay rejection.
- `repositoryRoot` validation: relative path rejection, symlink root, non-directory root, unwritable root.
- lockOwnerId validation: empty value, >128-length, non-identifier.
- symlink and non-regular path attacks for repository root, `.shield`, `may-control-events`, log file, and lock file.
- directory sync points for repository root, `.shield`, `may-control-events`, and first parent-after-create sync.
- lock holder contention (`EEXIST`), lock marker short write/sync, lock release drift, and marker/inode/dev mismatch.
- lock mutex directory sync failures:
  - first lock-parent sync failure,
  - verified lock unlink failure,
  - second lock-parent sync failure,
  - each yields `recovery_required` override.
- append uncertainty paths: short write, append sync failure, reread mismatch.
- uncertainty override matrix: recovery precedence after mutation uncertainty.
- exact adapter receipt `{ eventId, appended }` and persisted readback compatibility.
- closed-wrapper behavior when factory has malformed input.
- direct `appendControlEvent(event)` compatibility with `MayControlLoopDependencies`.

## Error closure rationale

- No raw session IDs in paths.
- No skipped tail salvage.
- No invented `src/may-control-events/*.ts` paths.
- No numeric or index-bearing receipts.
- No batch sink.
- No conflict-as-new-event.
