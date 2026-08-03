# Issue #173 May blueprint — atomic packet claim for seat-dispatch

## Identity and scope

- Mission: `mission:issue-173`
- Mission revision: `sha256:0R-U1zLWj0QWhEa4NXeQ424Biahr5eiyJTHRqy04rrU`
- Objective: add one atomic, locked `dispatch.started` claim boundary so one governed packet cannot become a fresh effect across concurrency/restart/uncertain-start windows.
- Authority: planning-only, non-authoritative blueprint.
- Frozen boundaries: no scheduler/retry/model/tool invocation changes; no #170/#171/#172/#137/#29 scope broadening; no publish/merge/deploy/release.

## Exact path set (smallest)

The later implementation freeze has exactly these four mandatory paths:

1. `packages/shield-team-system/src/seat-dispatch-store.mts` — define the closed claim contract and atomic claim operation in the existing lock/read/replay/write seam; reserve packet-binding evidence at the generic public append boundary.
2. `packages/shield-team-system/src/dispatch-receipts.mts` — publicly export the claim function and its input/result/failure declarations through the existing facade.
3. `packages/shield-team-system/tests/seat-dispatch-store.test.mjs` — focused atomic claim, replay, lock-release, crash, conflict, and precedence tests.
4. `packages/shield-team-system/tests/package-surface.test.mjs` — mandatory assertions for the public function export and closed declarations.

`packages/shield-team-system/src/seat-dispatch-receipt-v1.mts` is excluded: #173 does not change the receipt schema, and packet canonicalization/identity belongs to the store claim boundary. This blueprint and other docs-only mission artifacts are governance inputs, not implementation paths. Any newly discovered need for another production or test path is fail-closed and requires a new freeze rather than an opportunistic edit.

## Closed public API and strict result states

Add a new claim function in the store layer, using the existing outer result envelope exactly once:

- `claimSeatDispatchPacketV1(input: SeatDispatchPacketClaimInputV1): Promise<SeatDispatchStoreContractResult<SeatDispatchPacketClaimResultV1>>`

Required exact input fields:

- `repositoryRoot`, `repositoryId`, `repositoryWorkspaceId`, `lockOwnerId`
- `parentMissionId`, `parentMissionRevision`, `parentSessionId`
- `accountableSeatId`, `subjectId`, `subjectRevision`, `artifactId`, `artifactRevision`, `repositoryRevision`
- `startedAt` — a required trusted-host-supplied RFC 3339 UTC instant, normalized to canonical millisecond form and persisted as the existing `dispatch.started` event timestamp; it must come from the dispatch host's clock, never packet content, model output, or caller-controlled packet JSON
- `configuredRuntime`, `requestedRuntime`, `toolExecution`, `runtimeSelfReport`, `runtimeHostObserved`, `executorSelfReport`, `executorHostObserved`
- `packetId`
- `packetBytes: Uint8Array` (the sole accepted runtime representation)
- optional `inputEvidenceRefs` (caller refs are normalized; every caller-supplied ref in the reserved packet-binding namespace is rejected; after exact dedupe, at most 15 caller refs are accepted so the one internal packet-binding ref keeps the persisted receipt at its existing maximum of 16)
- No caller-supplied `childTaskId`, `childSessionId`, `receiptId`, or `dispatchId`; these are derived from the claim namespace.

Strict input validation remains identifier-safe and plain-object bounded before any FS access.

`SeatDispatchStoreContractResult<T>` remains the only `state: "valid" | "invalid"` envelope. Its success `value` is the closed `SeatDispatchPacketClaimResultV1` union:

- `{ claimStatus: "claimed", logPath, byteLength, packetDigest, receipt, executionDisposition: "execute_once" }`
- `{ claimStatus: "already_claimed", logPath, byteLength, packetDigest, receipt }`

`executionDisposition: "execute_once"` is a claimed-only structural control-flow discriminator returned only after the newly appended row passes durable exact readback and lock release succeeds. It is explicitly non-authoritative, is not persisted, is not a credential or token, and creates no new authority class; callers still operate only under their existing governed authority. The outer invalid branch uses the existing `code` + `errors` shape and has no success `value`. Type/runtime tests must prove `executionDisposition` is present only for `value.claimStatus === "claimed"`; `already_claimed`, every invalid result, every conflict, and every uncertain/recovery result omit it.

Export a closed `SeatDispatchPacketClaimFailureCodeV1` union, and use it as the outer invalid branch's `code` type:

```ts
type SeatDispatchPacketClaimFailureCodeV1 =
  | "malformed_input"
  | "malformed_packet"
  | "unsafe_path"
  | "repository_unavailable"
  | "receipt_unavailable"
  | "dispatch_receipt_lock_held"
  | "mixed_scope"
  | "malformed_log"
  | "malformed_event"
  | "digest_mismatch"
  | "duplicate_event"
  | "duplicate_start"
  | "global_sequence_gap"
  | "global_previous_digest"
  | "lifecycle_sequence_gap"
  | "lifecycle_previous_digest"
  | "illegal_transition"
  | "post_terminal"
  | "timestamp_regression"
  | "identity_mismatch"
  | "receipt_dispatch_collision"
  | "child_task_reuse"
  | "child_session_reuse"
  | "output_evidence_misplacement"
  | "packet_claim_conflict"
  | "recovery_required";
```

This is the exact exhaustive union for the validation, canonicalization, safe-path, repository access, receipt access, lock, every currently reachable `SeatDispatchReplayFailureCode`, claim-conflict, and uncertain store outcomes admitted by this API. The implementation must map lower-level exceptions into one of these members and may not leak an open string code.

## Bounded packet representation and canonical packet-byte digest

The claim API accepts only `Uint8Array`. At function entry, before the first `await` or other externally observable operation, copy it with `new Uint8Array(input.packetBytes)` so caller mutation cannot change validation or digest input. Reject non-`Uint8Array` values as `malformed_input`; reject a snapshot longer than 1,048,576 bytes as `malformed_packet`.

Parse the snapshot as follows, reusing the repository's existing strict JSON parsing/canonicalization machinery wherever it already supplies these guarantees; adapt that implementation locally rather than naming or depending on a helper that does not exist:

1. Decode with fatal UTF-8 semantics: malformed, overlong, truncated, or otherwise invalid UTF-8 is `malformed_packet`; no replacement characters.
2. Accept exactly one JSON value with only JSON whitespace around it. Reject duplicate object keys at parse time and reject any decoded string or object key containing an unpaired UTF-16 surrogate.
3. Bound nesting to 64 containers: the root value is depth 0 and entering each array/object increments depth by one. Bound each array to 10,000 elements and each object to 10,000 members. A limit violation is `malformed_packet`.
4. Canonicalize without a trailing newline: emit `null`, `true`, and `false` literally; preserve array order; sort object keys lexicographically by UTF-16 code-unit order; encode strings with JSON escaping using lowercase hex for required `\\u00xx` control escapes and otherwise the shortest valid JSON representation; emit finite IEEE-754 binary64 numbers using ECMAScript's shortest round-trippable decimal form, with `-0` emitted as `0`. Reject numbers that cannot be represented exactly as the parsed finite binary64 value under this profile.
5. UTF-8 encode the canonical JSON with no BOM and no trailing bytes. Compute raw `SHA-256(canonicalPacketUtf8Bytes)`, encode all 32 digest bytes as unpadded base64url, and expose `packetDigest = "sha256:" + encodedDigest`.

This defines semantic canonical equality independent of source whitespace and object member order; the digest is of the exact canonical UTF-8 bytes, not the original packet bytes and not a newline-terminated variant.

## Deterministic identity derivation (mission+packet bound)

Derive stable claim namespace first, then persist packet binding in `inputEvidenceRefs`:

- Let `claimSeedInput` be the exact UTF-8 bytes, with no BOM or terminator, of the domain-separated string `seat-dispatch-claim-v1` + U+0000 + `parentMissionId` + U+0000 + `parentSessionId` + U+0000 + `packetId`.
- `claimSeed = SHA-256(claimSeedInput)`, retaining all 32 raw digest bytes.
- `claimKey = first 32 ASCII characters of unpadded base64url(all 32 claimSeed bytes)`; truncation occurs only after encoding the complete digest.
- `dispatchId` = `dispatch:<claimKey>`
- `receiptId` = `receipt:<claimKey>`
- `childTaskId` = `task:<claimKey>`
- `childSessionId` = `session:<claimKey>`
- `requiredPacketBindingEvidenceRef = evidence:packet-binding:seat-dispatch-v1:<claimKey>:<packetDigest>`

`childTaskId` is not caller input; `packetId` deterministically maps to `childTaskId` via `claimKey` and `childSessionId`. Any caller-supplied identity override is rejected as malformed identity mismatch.

Stable identity selects the prior claim. Digest equality is necessary but not sufficient for `already_claimed`: the stored start must also equal the normalized candidate across every caller-controlled start field listed below.

## One lock-scoped validate/replay/append `dispatch.started` operation

Implement exactly one atomic claim path:

1. Snapshot `packetBytes`, then validate input + strict bounded packet canonicalization + derived identities before the first filesystem mutation.
2. Acquire lock (`.shield/dispatch-receipts.jsonl.lock`) with inode/device marker.
3. Read/store-log and `replaySeatDispatchReceiptsV1` under lock.
4. Validate candidate `dispatch.started` event via existing event factory/validator.
5. Replay rules:
   - Normalize caller `inputEvidenceRefs` using the existing evidence-ref validation/order rules and dedupe exact non-reserved refs. Reject every caller-supplied ref beginning with the exact reserved namespace prefix `evidence:packet-binding:seat-dispatch-v1:` as `malformed_input`, including a ref textually equal to the required ref. If exact dedupe leaves more than 15 caller refs, return `malformed_input` before mutation. Only the private/internal claim construction step injects exactly one `requiredPacketBindingEvidenceRef`, producing at most the receipt contract's existing 16 refs.
   - If no match for derived `(receiptId, dispatchId, childSessionId, childTaskId)` exists, append `dispatch.started` candidate.
   - If the stable identity exists, compare the full normalized candidate start projection against the stored start. Comparison includes the derived IDs and fixed start kind; packet binding; normalized non-reserved `inputEvidenceRefs`; and every persisted caller-controlled start field: `repositoryId`, `repositoryWorkspaceId`, `parentMissionId`, `parentMissionRevision`, `parentSessionId`, `accountableSeatId`, `subjectId`, `subjectRevision`, `artifactId`, `artifactRevision`, `repositoryRevision`, `configuredRuntime`, `requestedRuntime`, `toolExecution`, `runtimeSelfReport`, `runtimeHostObserved`, `executorSelfReport`, and `executorHostObserved`.
   - Do not compare retry `startedAt` with the persisted original start timestamp. The first successful append freezes its trusted host timestamp; a retry necessarily observes a later host time, and requiring equality would turn an otherwise exact retry into a false conflict. The stored timestamp is returned unchanged on `already_claimed`; it is never rewritten or replaced by retry input.
   - Otherwise exclude only fields produced by locking or log-chain persistence, such as lock marker data, byte offsets/length, previous/event hashes, and serialized row bytes. `repositoryRoot` and `lockOwnerId` are operation-routing/lock inputs rather than persisted start fields; they remain strictly validated but are not part of the durable start projection.
   - Return `already_claimed` only when every compared normalized field is equal, including exactly one matching reserved packet-binding ref. A different digest, a missing/malformed binding, or any other compared-field mismatch returns `packet_claim_conflict` with no write.
6. Append candidate row only after candidate+current replay validate.
7. Reread and exact-readback-verify bytes before returning.
8. Hold the computed outcome as pending and run the result-bearing release operation below. Return nothing, and attach no `executionDisposition`, until release succeeds. After successful release, return `executionDisposition: "execute_once"` only if the pending outcome is the invocation that appended and durably verified the new row. Existing-row readback returns `already_claimed` without that field.

No helper path may read then append outside this lock-scoped sequence.

## Result-bearing lock creation and release

- Lock creation uses exclusive creation, writes the complete owner/nonce marker, syncs the lock file, obtains and retains the created lock's `dev` and `ino`, then syncs the lock parent directory before protected receipt work begins. Failure or uncertainty at any creation/sync step produces a closed failure with no receipt mutation or authorization.
- Release is a result-bearing operation: `{ state: "released" } | { state: "uncertain", code: "recovery_required", errors }`. Before unlink, open/stat and parse the current marker and require the expected owner ID, unguessable acquisition nonce, `dev`, and `ino` to equal the acquired-lock record. A mismatch, unreadable marker, or failed validation does not unlink and returns uncertain.
- After validated unlink, verify that the same directory entry is absent without following a replacement symlink, then sync the lock parent directory. An unlink, absence-verification, or directory-sync failure is uncertain even if unlink may have happened.
- Every result computed while holding the lock is pending until release completes. Release uncertainty is the final override over pending `claimed`, `already_claimed`, conflict, replay/store failure, or any other pending result: return outer invalid `recovery_required`, omit `value` and `executionDisposition`, and perform no compensating receipt write. Only `{ state: "released" }` permits the pending result to be returned.

## Duplicate, conflict, and non-executable semantics

- Duplicate exact readback (same stable claim identity + matching canonical packet binding + equality of every normalized caller-controlled start field):
  - `state=valid`, `claimStatus="already_claimed"`, no bytes changed, no side effects.
  - execution must not proceed from duplicate replay.
- Same stable claim identity + different `packetDigest` (visible via reserved binding evidence):
  - fail closed with `code = "packet_claim_conflict"`, no bytes changed.
- Same stable claim identity + non-canonical packet bytes:
  - if canonical packet digest and all normalized start fields are equal, result is `already_claimed`;
  - if canonical packet digest differs, result is `packet_claim_conflict`.

## Reserved evidence namespace and trust boundary

- Reserve the prefix `evidence:packet-binding:seat-dispatch-v1:` at the generic public receipt-append boundary, not only in `claimSeatDispatchPacketV1`. Public append/candidate validation rejects any caller-supplied `inputEvidenceRefs` entry with that prefix as `malformed_input` before mutation.
- The atomic claim path uses an internal-only construction route to inject exactly one reserved ref after all caller refs have passed the public rules. Stored-row replay accepts and validates the one canonical reserved ref; it does not reinterpret it as caller authority.
- This is an application API trust boundary, not protection against an actor with direct write access to `.shield/dispatch-receipts.jsonl`. Repository filesystem ownership/ACLs must keep direct writers trusted; direct filesystem tampering remains subject to existing strict replay/hash-chain checks and otherwise fails closed. No new receipt schema or cryptographic authentication claim is introduced.
- Later implementation freeze must therefore include the generic append validation change in `seat-dispatch-store.mts` and its focused spoof test; it does not add another production path beyond the path set above.

## Crash/uncertain start behavior

- The only executable gate is a durable `dispatch.started` row for that deterministic claim identity.
- If `dispatch.started` append/readback and lock release succeed and the returned claimed value contains `executionDisposition: "execute_once"`, that invocation may proceed under its existing governed authority. The field and receipt presence are not authorization credentials.
- Any uncertain/ambiguous result after this boundary (marker loss, short write, sync/readback mismatch, append replay failure, lock-release identity mismatch, unlink verification failure, or lock-directory sync failure) returns `recovery_required`, has no execution authorization, and must be treated as **not executable**.
- After a possibly completed append, do not claim that receipt bytes were preserved and do not attempt a compensating truncate/delete/write. A later locked replay either observes exactly one prior durable claim and returns it as non-executable `already_claimed`, or cannot establish a valid unique claim and remains fail-closed. It must never manufacture a fresh executable `claimed` result from the uncertain attempt.
- Restart must consult replay+exact readback before execution and never treat any uncertainty as fresh unclaimed packet.

## Failure-code precedence (closed)

1. `malformed_input` — shape/descriptor/scope invalid.
2. `malformed_packet` — strict JSON parse/canonicalization failure.
3. `unsafe_path` — repo/root/log/lock path violations.
4. `repository_unavailable` — repository root cannot be safely opened/read for the operation after path validation.
5. `receipt_unavailable` — receipt log or its required parent cannot be safely opened/read before mutation.
6. `dispatch_receipt_lock_held` — a valid existing lock prevents acquisition.
7. `mixed_scope`, `receipt_dispatch_collision`, or `child_task_reuse` from retained receipt replay.
8. `packet_claim_conflict` — same stable claim identity with a different packet digest or any mismatch in the full normalized start projection.
9. `recovery_required` — any partial/uncertain mutation or lock lifecycle path (write/readback sync, short write, marker identity mismatch, unlink/absence verification, or lock-parent directory sync).

This ordering selects the pending result. After lock acquisition, release uncertainty is a separate final override and always replaces that pending result with `recovery_required`. Lock/append/release uncertainty must not be retried as executable.

## Focused test matrix for #173 ACs

Target: `packages/shield-team-system/tests/seat-dispatch-store.test.mjs`

- `claim` succeeds through one outer `state=valid` envelope, appends exactly one canonical `dispatch.started` entry, and returns `executionDisposition: "execute_once"` only in the closed `claimed` value.
- Exact duplicate claim for same stable claim identity + same digest and identical normalized start projection returns outer `state=valid` + `value.claimStatus=already_claimed`, preserves bytes, and has no `executionDisposition`.
- Closed-envelope tests prove invalid, conflict, lock-held, replay-invalid, recovery/uncertain, and `already_claimed` results cannot contain `executionDisposition`; no nested `state` exists in a success value.
- Same stable claim identity + different packet bytes returns `packet_claim_conflict`, no mutation.
- Same stable claim identity + equivalent-whitespace canonical packet bytes dedupes to `already_claimed`.
- Canonicalization edge cases cover invalid/overlong/truncated UTF-8, BOM/trailing data, duplicate keys, lone high/low surrogates in values and keys, 1,048,576/1,048,577-byte boundary, depth 64/65, array and object 10,000/10,001-member boundaries, key-order differences, array-order significance, escaped-vs-literal Unicode equality, `-0` normalization, exponent/shortest-number normalization, unsafe/unrepresentable numeric inputs, and absence of a digest newline.
- Non-JSON / malformed JSON packet and every parser/canonicalization limit failure return `malformed_packet` pre-mutation; a mutable source buffer changed after call entry cannot alter the snapshotted digest or event.
- Duplicate non-reserved `inputEvidenceRefs` collapse under existing normalization. Exactly 15 deduped caller refs succeed and produce 16 persisted refs after internal binding injection; 16 deduped caller refs fail as `malformed_input` before lock/mutation. Any caller-supplied `evidence:packet-binding:seat-dispatch-v1:` ref, including the correct-looking ref, is rejected pre-mutation by both claim input and generic public append; an internal claim emits exactly one canonical reserved ref.
- A generic-public-append spoof test proves a caller cannot inject the reserved binding. A direct-filesystem tamper test is limited to documenting/confirming the existing replay trust boundary; #173 does not claim protection from a trusted direct writer.
- For the same stable identity and packet digest, stale/different `parentMissionRevision`, `repositoryId`/`repositoryWorkspaceId`/`repositoryRevision`, `subjectId`/`subjectRevision`, `artifactId`/`artifactRevision`, or any runtime/executor/tool field returns `packet_claim_conflict`, preserves bytes, and has no authorization token.
- For the same stable identity and packet digest, changed normalized non-reserved evidence refs or accountable-seat/start metadata also returns `packet_claim_conflict` with no mutation.
- `dispatch.started` only: lifecycle cannot be claimed with non-start kind via claim API.
- `dispatch.started` duplicate with mismatched derived IDs fails at malformed-input boundary.
- Mixed scope / foreign scope / replay invalid / non-canonical ledger errors fail closed and preserve bytes.
- Lock contention and lock-holder marker tamper path do not mutate bytes and preserve replay integrity.
- Lock creation tests cover lock-file sync and parent-directory sync; release tests cover owner/nonce and inode/device validation before unlink, replacement-marker refusal, verified absence, parent-directory sync, and the result-bearing release shape.
- A release failure overrides each representative pending outcome (`claimed`, `already_claimed`, conflict, and replay/store invalid) with outer invalid `recovery_required`; every override omits `executionDisposition`.
- Uncertain write/sync/readback returns `recovery_required`, no execution authorization, and performs no compensating write; tests permit bytes to contain zero or one complete prior claim according to the injected failure point rather than asserting byte preservation.
- Restart after uncertain append either replays exactly one durable row as non-executable `already_claimed` or remains fail-closed on missing/partial/invalid state; it never returns a new executable claim for the uncertain attempt.
- Trusted timestamp tests prove the first `startedAt` is persisted and returned, packet-provided timestamps cannot source/override it, a retry with a later valid host `startedAt` can be `already_claimed`, and retry does not rewrite the original timestamp.
- Child session reuse for different packets and same mission is rejected deterministically by derived identity collision rules.
- Concurrent claim simulation: one winner appends, others receive non-executable state or conflict without mutation.

## Validation commands

1. `npm --prefix packages/shield-team-system run build`
2. `node --test packages/shield-team-system/tests/seat-dispatch-store.test.mjs`
3. `node --test packages/shield-team-system/tests/package-surface.test.mjs`
4. `npm --prefix packages/shield-team-system test`
5. `git diff --check`

Both focused test commands are mandatory: the store suite proves behavior and the package-surface suite proves the public function plus closed input/result/failure declarations. The full package test remains the final regression command.
