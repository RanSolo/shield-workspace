# Issue #173 May blueprint — atomic packet claim for seat-dispatch

## Identity and scope

- Mission: `mission:issue-173`
- Mission revision: `sha256:0R-U1zLWj0QWhEa4NXeQ424Biahr5eiyJTHRqy04rrU`
- Objective: add one atomic, locked `dispatch.started` claim boundary so one governed packet cannot become a fresh effect across concurrency/restart/uncertain-start windows.
- Authority: planning-only, non-authoritative blueprint.
- Frozen boundaries: no scheduler/retry/model/tool invocation changes; no #170/#171/#172/#137/#29 scope broadening; no publish/merge/deploy/release.

## Exact path set (smallest)

Implementation has exactly these four mandatory paths:

1. `packages/shield-team-system/src/seat-dispatch-store.mts` — define the closed claim contract and atomic claim operation in the existing lock/read/replay/write seam; reserve packet-binding evidence at the generic public append boundary.
2. `packages/shield-team-system/src/dispatch-receipts.mts` — publicly export the claim function and its input/result/failure declarations through the existing facade.
3. `packages/shield-team-system/tests/seat-dispatch-store.test.mjs` — focused atomic claim, replay, lock-release, crash, conflict, and precedence tests.
4. `packages/shield-team-system/tests/package-surface.test.mjs` — mandatory assertions for the public function export and closed declarations.

`packages/shield-team-system/src/seat-dispatch-receipt-v1.mts` is excluded: #173 does not change the receipt schema, and packet canonicalization/identity belongs to the store claim boundary. This blueprint and other docs-only mission artifacts are governance inputs, not implementation paths. Any newly discovered need for another production or test path is fail-closed and requires a new freeze rather than an opportunistic edit.

## Closed public API and strict result states

Add a new claim function in the store layer with a specialized, closed claim envelope; do not widen or parameterize the existing `SeatDispatchStoreContractResult<T>` used by other store APIs:

```ts
export type SeatDispatchPacketClaimContractResultV1 =
  | { state: "valid"; value: SeatDispatchPacketClaimResultV1 }
  | {
      state: "invalid";
      code: SeatDispatchPacketClaimFailureCodeV1;
      errors: string[];
    };

export function claimSeatDispatchPacketV1(
  input: SeatDispatchPacketClaimInputV1,
): Promise<SeatDispatchPacketClaimContractResultV1>;
```

The resulting existing-file signature impact is exact: `seat-dispatch-store.mts` defines and exports `SeatDispatchPacketClaimInputV1`, `SeatDispatchPacketClaimResultV1`, `SeatDispatchPacketClaimFailureCodeV1`, `SeatDispatchPacketClaimContractResultV1`, and `claimSeatDispatchPacketV1`; `dispatch-receipts.mts` re-exports those five declarations. Existing `SeatDispatchStoreContractResult<T>` and every existing function signature remain unchanged.

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

Before reading `packetBytes`, before the first `await`, and before any filesystem access, perform this exact synchronous outer-input snapshot:

1. Reject `input` if `node:util`'s `types.isProxy(input)` is true, if it is null/non-object, or if its prototype is not exactly `Object.prototype`. This intentionally rejects null-prototype objects, class instances, arrays, and proxies as `malformed_input`.
2. Call `Object.getOwnPropertyDescriptors(input)` only after the proxy/plain-object checks. Reject symbol keys, missing required keys, unexpected string keys, and any expected property whose own descriptor is an accessor or has `enumerable !== true`. Every accepted field must be an enumerable own data property; descriptor `writable` and `configurable` do not affect its value semantics.
3. Read every input value only from its validated descriptor's `.value`; never evaluate `input.packetBytes` or another property through ordinary property access. Copy scalar/object field references into a local snapshot for their existing strict validators.
4. Obtain `packetBytes` from its descriptor `.value`; reject it if `types.isProxy(packetBytes)` is true or it is not a genuine `Uint8Array` with typed-array internal slots. Then synchronously copy it into a new `Uint8Array` before the first `await`. All later packet validation, canonicalization, and hashing use only that copy.

Strict input validation remains identifier-safe and bounded before filesystem access. Nested structured runtime/executor/tool values continue through their existing strict validators, which map failures to the dedicated closed codes below.

`SeatDispatchPacketClaimContractResultV1` is the only `state: "valid" | "invalid"` envelope for this API. Its success `value` is the closed `SeatDispatchPacketClaimResultV1` union:

- `{ claimStatus: "claimed", logPath, byteLength, packetDigest, receipt, executionDisposition: "execute_once" }`
- `{ claimStatus: "already_claimed", logPath, byteLength, packetDigest, receipt }`

`executionDisposition: "execute_once"` is a claimed-only structural control-flow discriminator returned only after the newly appended row passes durable exact readback and lock release succeeds. It is explicitly non-authoritative, is not persisted, is not a credential or token, and creates no new authority class; callers still operate only under their existing governed authority. The outer invalid branch uses the existing `code` + `errors` shape and has no success `value`. Type/runtime tests must prove `executionDisposition` is present only for `value.claimStatus === "claimed"`; `already_claimed`, every invalid result, every conflict, and every uncertain/recovery result omit it.

Export a closed `SeatDispatchPacketClaimFailureCodeV1` union, and use it as the outer invalid branch's `code` type:

```ts
type SeatDispatchPacketClaimFailureCodeV1 =
  | "malformed_input"
  | "malformed_packet"
  | "malformed_runtime"
  | "malformed_executor"
  | "malformed_tool_execution"
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

The claim API accepts only `Uint8Array`. At function entry, before the first `await` or other externally observable operation, copy only from the already validated `packetBytesDescriptor.value` held in the local descriptor snapshot, never through ordinary `input.packetBytes` property access, so caller mutation cannot change validation or digest input. Reject non-`Uint8Array` values as `malformed_input`; reject a snapshot longer than 1,048,576 bytes as `malformed_packet`.

Parse the snapshot as follows, reusing the repository's existing strict JSON parsing/canonicalization machinery wherever it already supplies these guarantees; adapt that implementation locally rather than naming or depending on a helper that does not exist:

1. Decode with fatal UTF-8 semantics: malformed, overlong, truncated, or otherwise invalid UTF-8 is `malformed_packet`; no replacement characters.
2. Accept exactly one JSON value with only JSON whitespace around it. Reject duplicate object keys at parse time and reject any decoded string or object key containing an unpaired UTF-16 surrogate.
3. Bound nesting to 64 containers: the root value is depth 0 and entering each array/object increments depth by one. Bound each array to 10,000 elements and each object to 10,000 members. A limit violation is `malformed_packet`.
4. Canonicalize without a trailing newline: emit `null`, `true`, and `false` literally; preserve array order; sort object keys lexicographically by UTF-16 code-unit order; encode strings with JSON escaping using lowercase hex for required `\\u00xx` control escapes and otherwise the shortest valid JSON representation. For each JSON number token, parse its grammar as an exact decimal mathematical value and also parse it to IEEE-754 binary64. Reject it as `malformed_packet` unless the binary64 result is finite and its exact mathematical value equals the token's exact decimal value. Accepted values are emitted using ECMAScript's shortest round-trippable binary64 decimal form, with any accepted negative zero emitted as `0`.
5. UTF-8 encode the canonical JSON with no BOM and no trailing bytes. Compute raw `SHA-256(canonicalPacketUtf8Bytes)`, encode all 32 digest bytes as unpadded base64url, and expose `packetDigest = "sha256:" + encodedDigest`.

The exact-number rule deliberately rejects decimal literals that silently round, including ordinary `0.1`; packets needing non-binary-exact decimal quantities must encode them as JSON strings (for example, `"0.1"`). This remains usable for normal JSON packet structure, strings, booleans, null, integers through the safe exact range, powers of two, and binary-exact fractions such as `0.5`, while preventing digest identity from depending on silent numeric precision loss.

Required numeric vectors:

- accept `0`, `-0` (emit `0`), `1`, `9007199254740991`, `0.5`, `0.125`, and `1e3` (emit the shortest ECMAScript form);
- reject `0.1` because its exact decimal value is not its binary64 value;
- reject unsafe integer `9007199254740993` because binary64 rounds it to `9007199254740992`;
- reject overflow `1e309` because binary64 is non-finite;
- reject underflow `1e-400` because binary64 becomes zero while the exact decimal is nonzero;
- reject high precision `1.0000000000000001` because binary64 becomes exactly `1`;
- accept exactly representable high-magnitude `9007199254740992`, while still rejecting adjacent non-representable integers under the equality rule.

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

- If `.shield` does not exist, create that single directory and immediately sync the already-open validated repository root directory before creating/opening the receipt log or lock. A root-directory sync failure returns `recovery_required`, performs no further mutation, and grants no execution disposition; the possibly created `.shield` directory is not removed as compensation.
- Generate the acquisition nonce with `node:crypto.randomBytes(32)` before lock creation and encode all 32 bytes as 43-character unpadded base64url. Entropy-source failure maps to `recovery_required` with no lock or receipt mutation.
- Lock creation uses exclusive no-follow creation with mode `0600`. Its exact marker is one UTF-8 canonical JSON line, with no extra fields or whitespace: `{"lockOwnerId":<JSON string>,"nonce":<43-character base64url JSON string>,"version":1}\n`. This avoids delimiter ambiguity; both fields are validated before serialization and strict parsing requires exactly those three keys and values.
- Write the complete marker, sync the lock file, obtain and retain the created lock's `dev` and `ino`, then sync the lock parent directory before protected receipt work begins. Failure or uncertainty at any creation/sync step produces `recovery_required` with no receipt authorization and no compensating unlink unless the normal validated result-bearing release operation can safely run.
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
- Implementation must therefore include the generic append validation change in `seat-dispatch-store.mts` and its focused spoof test; it does not add another production path beyond the path set above.

## Crash/uncertain start behavior

- The only executable gate is a durable `dispatch.started` row for that deterministic claim identity.
- If `dispatch.started` append/readback and lock release succeed and the returned claimed value contains `executionDisposition: "execute_once"`, that invocation may proceed under its existing governed authority. The field and receipt presence are not authorization credentials.
- Any uncertain/ambiguous result after this boundary (marker loss, short write, sync/readback mismatch, append replay failure, lock-release identity mismatch, unlink verification failure, or lock-directory sync failure) returns `recovery_required`, has no execution authorization, and must be treated as **not executable**.
- After a possibly completed append, do not claim that receipt bytes were preserved and do not attempt a compensating truncate/delete/write. A later locked replay either observes exactly one prior durable claim and returns it as non-executable `already_claimed`, or cannot establish a valid unique claim and remains fail-closed. It must never manufacture a fresh executable `claimed` result from the uncertain attempt.
- Restart must consult replay+exact readback before execution and never treat any uncertainty as fresh unclaimed packet.

## Failure-code precedence (closed)

1. `malformed_input` — shape/descriptor/scope invalid.
2. `malformed_packet` — strict JSON parse/canonicalization failure.
3. `malformed_runtime` — configured/requested/runtime-observation validation failure.
4. `malformed_executor` — executor self/host observation validation failure.
5. `malformed_tool_execution` — tool-execution validation failure.
6. `unsafe_path` — repo/root/log/lock path violations.
7. `repository_unavailable` — repository root cannot be safely opened/read for the operation after path validation.
8. `receipt_unavailable` — receipt log or its required parent cannot be safely opened/read before mutation.
9. `dispatch_receipt_lock_held` — a valid existing lock prevents acquisition.
10. `mixed_scope` — replayed rows span a forbidden scope.
11. `malformed_log` — receipt log framing is malformed.
12. `malformed_event` — a replayed or candidate event fails event validation.
13. `digest_mismatch` — a stored event digest does not match its canonical content.
14. `duplicate_event` — an event identity repeats.
15. `duplicate_start` — a lifecycle has more than one start.
16. `global_sequence_gap` — global sequence is not contiguous.
17. `global_previous_digest` — global digest linkage is invalid.
18. `lifecycle_sequence_gap` — lifecycle sequence is not contiguous.
19. `lifecycle_previous_digest` — lifecycle digest linkage is invalid.
20. `illegal_transition` — lifecycle transition is not allowed.
21. `post_terminal` — an event follows a terminal lifecycle event.
22. `timestamp_regression` — replayed lifecycle time moves backward.
23. `identity_mismatch` — immutable lifecycle identity fields disagree.
24. `receipt_dispatch_collision` — receipt/dispatch identity collides.
25. `child_task_reuse` — child task identity is reused illegally.
26. `child_session_reuse` — child session identity is reused illegally.
27. `output_evidence_misplacement` — output evidence appears on a forbidden event.
28. `packet_claim_conflict` — same stable claim identity has a different digest or normalized start projection.
29. `recovery_required` — entropy failure, first-creation repository-root sync failure, or any partial/uncertain mutation or lock lifecycle path.

This ordering selects the pending result. After lock acquisition, release uncertainty is a separate final override and always replaces that pending result with `recovery_required`. Lock/append/release uncertainty must not be retried as executable.

## Focused test matrix for #173 ACs

Target: `packages/shield-team-system/tests/seat-dispatch-store.test.mjs`

- `claim` succeeds through one outer `state=valid` envelope, appends exactly one canonical `dispatch.started` entry, and returns `executionDisposition: "execute_once"` only in the closed `claimed` value.
- Exact duplicate claim for same stable claim identity + same digest and identical normalized start projection returns outer `state=valid` + `value.claimStatus=already_claimed`, preserves bytes, and has no `executionDisposition`.
- Closed-envelope tests prove invalid, conflict, lock-held, replay-invalid, recovery/uncertain, and `already_claimed` results cannot contain `executionDisposition`; no nested `state` exists in a success value.
- Same stable claim identity + different packet bytes returns `packet_claim_conflict`, no mutation.
- Same stable claim identity + equivalent-whitespace canonical packet bytes dedupes to `already_claimed`.
- Canonicalization edge cases cover invalid/overlong/truncated UTF-8, BOM/trailing data, duplicate keys, lone high/low surrogates in values and keys, 1,048,576/1,048,577-byte boundary, depth 64/65, array and object 10,000/10,001-member boundaries, key-order differences, array-order significance, escaped-vs-literal Unicode equality, `-0` normalization, exponent/shortest-number normalization, unsafe/unrepresentable numeric inputs, and absence of a digest newline.
- Input snapshot tests reject an outer proxy without invoking its traps; reject class, array, null-prototype, inherited, symbol-keyed, extra-keyed, non-enumerable, and accessor-backed inputs; prove a `packetBytes` getter is never invoked; reject a proxied typed array; and prove mutation after call entry cannot alter the synchronous byte snapshot.
- Numeric tests assert every required accept/reject vector above, including explicit rejection of `0.1`, unsafe integer rounding, overflow, underflow-to-zero, and high-precision rounding.
- Non-JSON / malformed JSON packet and every parser/canonicalization limit failure return `malformed_packet` pre-mutation; a mutable source buffer changed after call entry cannot alter the snapshotted digest or event.
- Duplicate non-reserved `inputEvidenceRefs` collapse under existing normalization. Exactly 15 deduped caller refs succeed and produce 16 persisted refs after internal binding injection; 16 deduped caller refs fail as `malformed_input` before lock/mutation. Any caller-supplied `evidence:packet-binding:seat-dispatch-v1:` ref, including the correct-looking ref, is rejected pre-mutation by both claim input and generic public append; an internal claim emits exactly one canonical reserved ref.
- A generic-public-append spoof test proves a caller cannot inject the reserved binding. A direct-filesystem tamper test is limited to documenting/confirming the existing replay trust boundary; #173 does not claim protection from a trusted direct writer.
- For the same stable identity and packet digest, stale/different `parentMissionRevision`, `repositoryId`/`repositoryWorkspaceId`/`repositoryRevision`, `subjectId`/`subjectRevision`, `artifactId`/`artifactRevision`, or any runtime/executor/tool field returns `packet_claim_conflict`, preserves bytes, and has no `executionDisposition`.
- For the same stable identity and packet digest, changed normalized non-reserved evidence refs or accountable-seat/start metadata also returns `packet_claim_conflict` with no mutation.
- `dispatch.started` only: lifecycle cannot be claimed with non-start kind via claim API.
- `dispatch.started` duplicate with mismatched derived IDs fails at malformed-input boundary.
- Mixed scope / foreign scope / replay invalid / non-canonical ledger errors fail closed and preserve bytes.
- Lock contention and lock-holder marker tamper path do not mutate bytes and preserve replay integrity.
- Lock creation tests cover lock-file sync and parent-directory sync; release tests cover owner/nonce and inode/device validation before unlink, replacement-marker refusal, verified absence, parent-directory sync, and the result-bearing release shape.
- First `.shield` creation tests require immediate repository-root directory sync and map its failure to non-executable `recovery_required`. Marker tests assert exact canonical JSON-line bytes, strict key set, 32-byte/43-character nonce shape, delimiter-safe owner values, and entropy failure before lock mutation.
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
