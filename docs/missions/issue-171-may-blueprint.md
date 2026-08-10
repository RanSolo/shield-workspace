# Issue #171 May blueprint — Slice A permission-audit filesystem store

## Identity and authority

- Mission: `mission:issue-171`
- Accountable seat: May
- Planning runtime: hosted May after bounded local-May option packets failed exactness checks
- Base revision: `b8bba50510423591fa5e1e6d874c8176ea162353`
- Status: blueprint ready for Fury plan review; no implementation or human authority

## Slice boundary

Slice A adds production filesystem durability for the existing `PermissionAuditAppender` contract only. Slice B is deferred. Slice C is blocked on separate canonical schema-9 runtime-binding and positive typed Wheels Up authority prerequisites. No dispatch, model invocation, authority change, publication, or migration is included.

## Exact path set

1. `packages/shield-team-system/src/permission-audit-store.mts` — private host filesystem adapter and closed primitives.
2. `packages/shield-team-system/tests/permission-audit-store.test.mjs` — focused contract, durability, replay, and recovery tests.

No package export, public declaration, dependency, or documentation change is included in Slice A. The module compiles into `dist` for later internal host composition.

## Existing contracts reused unchanged

From `permission-audit-v1.mts`: `PermissionAuditRecord`, `PermissionAuditReceipt`, `PermissionAuditAppender`, `validatePermissionAuditRecord`, `validatePermissionAuditReceipt`, and `replayPermissionAuditLedger`.

The adapter follows confinement, exclusive lock ownership, no-follow append, sync, and exact reread patterns already present in `mission-store.mts` and `seat-dispatch-store.mts`. It does not redefine records, receipts, permission decisions, runtime bindings, or authority.

## New API

`permission-audit-store.mts` adds:

- `PermissionAuditStoreContractResult<T>`: closed `{ state: "valid", value }` or `{ state: "invalid", code, errors }` result.
- `PermissionAuditFilesystemStoreScopeInput` with exactly `repositoryRoot`, `ledgerId`, and `lockOwnerId` strings. `lockOwnerId` must satisfy the referenced store rule: a non-empty identifier no longer than 128 characters; violations are `malformed_input` before filesystem access.
- closed read and append input/result interfaces using the exact scope plus a `PermissionAuditRecord` only for append.
- `readPermissionAuditLedgerV1(input)` returning a closed result containing the exact ledger path, validated records, raw bytes, and missing state.
- `appendPermissionAuditRecordIfAbsentV1(input)` returning a closed result containing the exact path, byte length, records, raw bytes, and reconstructed `PermissionAuditReceipt`.
- `createPermissionAuditFilesystemStore(input)` returning a handle with `ledgerId`, `read(): Promise<unknown>`, and `appendIfAbsent(record): Promise<unknown>` compatible with `MissionCycleDependenciesV1.permissionAudit`. Primitive invalid results reject through one store error carrying the closed code; they never become a receipt-like value.

## Deterministic confined storage

- Validate `ledgerId` with the existing audit-record identifier boundary.
- Resolve a real, absolute, non-symbolic repository root.
- Store each ledger below `.shield/permission-audit/` using `sha256(ledgerId)` encoded as base64url plus `.jsonl`; its lock file is adjacent with `.lock` appended.
- Keep the original `ledgerId` in every record and exact-match it on every read and append, so a filename collision or mixed ledger fails closed.
- Reject path escape, symlinked/non-directory store roots, and symlinked/non-regular log or lock files. Use `O_NOFOLLOW` where supported by existing store patterns.
- Durable creation syncs each containing directory in order: after creating `.shield`, sync the repository root; after creating `.shield/permission-audit`, sync `.shield`; after first creating a ledger file, sync `.shield/permission-audit`. Any failure after directory or file creation is `recovery_required`.

## Canonical ledger read

1. Validate the exact input before filesystem access.
2. Missing ledger file is a valid empty ledger.
3. Existing bytes must be UTF-8, non-empty-line JSONL with a final newline.
4. A bounded strict JSON scanner in this module rejects duplicate object keys, malformed tokens, trailing data, unsafe shapes, and non-object top-level values before ordinary parsing.
5. Each parsed line must validate as `PermissionAuditRecord`, exact-match configured `ledgerId`, and equal `canonicalJson(parsedRecord)` byte-for-byte. New appends also serialize with `canonicalJson(record)` plus one newline.
6. Replay the complete array with `replayPermissionAuditLedger`; never skip or return a partial ledger.
7. Malformed, incomplete, noncanonical, foreign-ledger, or replay-invalid bytes return `permission_audit_replay_invalid`; bytes are not repaired or rewritten.

## Atomic append-if-absent

1. Validate exact input, candidate record, and `record.ledgerId === configured ledgerId` before mutation.
2. Acquire an exclusive `wx`/`O_EXCL|O_NOFOLLOW` lock containing a full-written, synced owner marker; record inode/device identity for release verification.
3. Under the lock, read and replay the complete current ledger.
4. If `recordId` exists and the canonical existing record exactly equals the candidate, return its reconstructed receipt at the existing zero-based index without writing.
5. If the same `recordId` differs, return `permission_audit_id_conflict`. Other duplicate decision, ordering, or identity conflicts are rejected by projected replay.
6. Replay `existing + candidate` before writing.
7. Append exactly one canonical newline-terminated record with `O_APPEND|O_CREAT|O_NOFOLLOW`; require a full write, sync the file, and sync the parent when newly created.
8. Reread the full ledger and require exact expected bytes plus valid replay.
9. Reconstruct and validate the receipt from the persisted record: schema version 1, record identity/digest fields, `appended: true`, and `ledgerSequence` equal to its zero-based replay index. Receipt rows are never persisted.
10. Verify lock inode/device and owner marker before unlink. A release-identity mismatch is `recovery_required` and must not unlink another owner's lock.

No retries, repair attempts, partial reads, partial-write acceptance, or fresh-effect substitution are permitted.

## Closed failure codes and precedence

1. `malformed_input` — unsafe shape or invalid candidate.
2. `unsafe_path` — root, directory, log, or lock confinement/type failure.
3. `permission_audit_lock_held` — another valid owner holds the lock.
4. `permission_audit_unavailable` — pre-mutation filesystem read/access failure with no evidence of mutation.
5. `permission_audit_replay_invalid` — strict parse, canonicality, ledger identity, or existing/projected replay failure.
6. `permission_audit_id_conflict` — same `recordId`, different canonical record.
7. `recovery_required` — any uncertain lock marker, append, short write, sync, directory sync, post-write reread, byte mismatch, receipt mismatch, or lock-release identity outcome.

After mutation begins, uncertainty takes precedence over narrower classifications and cannot be retried blindly.

## Focused test matrix

Tests cover: missing-ledger empty read; deterministic distinct per-ledger paths; successful append/read/restart receipt reconstruction; exact idempotency without byte change; same-ID conflict; foreign ledger rejection before write; decision/invocation/result ordering; duplicate key, malformed JSON, empty line, missing final newline, noncanonical line, and malformed tail; path escape and symlink/non-regular root/log/lock; lock contention and owner mismatch; short write; file and directory sync failures; post-write reread/byte mismatch; receipt validation; and proof that all uncertain outcomes preserve fail-closed recovery behavior.

## Exact validation commands

From repository root, in order:

1. `npm --prefix packages/shield-team-system run build`
2. `node --test packages/shield-team-system/tests/permission-audit-store.test.mjs`
3. `npm --prefix packages/shield-team-system test`
4. `git diff --check`

Mack validates the exact implementation revision as an external validation attachment after Wheels Up implementation. Mack is not a V0.3 Mission Brief participant and cannot provide human authority evidence.
