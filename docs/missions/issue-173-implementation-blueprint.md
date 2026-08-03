# Issue #173 May blueprint — atomic packet claim for seat-dispatch

## Identity and scope

- Mission: `mission:issue-173`
- Mission revision: `sha256:0R-U1zLWj0QWhEa4NXeQ424Biahr5eiyJTHRqy04rrU`
- Objective: add one atomic, locked `dispatch.started` claim boundary so one governed packet cannot become a fresh effect across concurrency/restart/uncertain-start windows.
- Authority: planning-only, non-authoritative blueprint.
- Frozen boundaries: no scheduler/retry/model/tool invocation changes; no #170/#171/#172/#137/#29 scope broadening; no publish/merge/deploy/release.

## Exact path set (smallest)

1. `packages/shield-team-system/src/seat-dispatch-receipt-v1.mts` — add minimal packet-digest/identity helpers if needed for deterministic packet binding.
2. `packages/shield-team-system/src/seat-dispatch-store.mts` — add the atomic claim operation in the existing lock/read/replay/write seam.
3. `packages/shield-team-system/src/dispatch-receipts.mts` — export the new claim API in the existing facade.
4. `packages/shield-team-system/tests/seat-dispatch-store.test.mjs` — focused atomic claim/replay/crash/precedence tests.
5. (If needed) `packages/shield-team-system/tests/package-surface.test.mjs` only if export surface changes must be contract-asserted by that suite.

## Closed public API and strict result states

Add a new claim function in the store layer, built on the existing result pattern:

- `claimSeatDispatchPacketV1(input: SeatDispatchPacketClaimInputV1): Promise<SeatDispatchStoreContractResult<SeatDispatchPacketClaimResultV1>>`

Required exact input fields:

- `repositoryRoot`, `repositoryId`, `repositoryWorkspaceId`, `lockOwnerId`
- `parentMissionId`, `parentMissionRevision`, `parentSessionId`
- `accountableSeatId`, `subjectId`, `subjectRevision`, `artifactId`, `artifactRevision`, `repositoryRevision`
- `configuredRuntime`, `requestedRuntime`, `toolExecution`, `runtimeSelfReport`, `runtimeHostObserved`, `executorSelfReport`, `executorHostObserved`
- `packetId`
- `packetBytes` (strict UTF-8 bytes/string, canonicalizable as JSON)
- optional `inputEvidenceRefs` (caller refs are normalized/merged; reserved packet-binding refs are validated and stripped/deduplicated before candidate event emission)
- No caller-supplied `childTaskId`, `childSessionId`, `receiptId`, or `dispatchId`; these are derived from the claim namespace.

Strict input validation remains identifier-safe and plain-object bounded before any FS access.

`SeatDispatchPacketClaimResultV1` is a closed union:

- `state: "valid"`
  - `claimStatus`: one of:
    - `"claimed"` (start row newly appended)
    - `"already_claimed"` (exact duplicate readback; non-executable)
  - `logPath`, `byteLength`, `packetDigest`, `receipt` (projection)
- `state: "invalid"` with `code` + `errors` only.

No API path may permit an executable attempt on an invalid result.

## Canonical packet-byte digest

1. Decode `packetBytes` as UTF-8 string.
2. Parse strictly as JSON; reject parse failures before mutation.
3. Compute deterministic canonical JSON (`sorted object keys`, array order preserved, primitives unchanged).
4. Compute `packetDigest = sha256(canonical-json + "\n")` and format as `sha256:<base64url>`.
5. Use digest as the packet binding evidence in `inputEvidenceRefs` (no receipt schema changes).

This keeps canonical equality independent of whitespace/order while preserving semantic byte identity.

## Deterministic identity derivation (mission+packet bound)

Derive stable claim namespace first, then persist packet binding in `inputEvidenceRefs`:

- `claimSeed = sha256( 'seat-dispatch-claim-v1' + '\\0' + parentMissionId + '\\0' + parentSessionId + '\\0' + packetId )`
- `claimKey = base64url(claimSeed)` (consume first 32 characters to stay under identifier width)
- `dispatchId` = `dispatch:<claimKey>`
- `receiptId` = `receipt:<claimKey>`
- `childTaskId` = `task:<claimKey>`
- `childSessionId` = `session:<claimKey>`
- `requiredPacketBindingEvidenceRef = evidence:packet-binding:seat-dispatch-v1:<claimKey>:<packetDigest>`

`childTaskId` is not caller input; `packetId` deterministically maps to `childTaskId` via `claimKey` and `childSessionId`. Any caller-supplied identity override is rejected as malformed identity mismatch.

Stable-identity outcome rule for comparison:
- If claim identity (`claimKey`) is already present, only `requiredPacketBindingEvidenceRef` controls duplicate vs conflict:
  - same digest in binding ⇒ `already_claimed`;
  - different digest ⇒ `packet_claim_conflict`.

## One lock-scoped validate/replay/append `dispatch.started` operation

Implement exactly one atomic claim path:

1. Validate input + strict packet canonicalization + derived identities.
2. Acquire lock (`.shield/dispatch-receipts.jsonl.lock`) with inode/device marker.
3. Read/store-log and `replaySeatDispatchReceiptsV1` under lock.
4. Validate candidate `dispatch.started` event via existing event factory/validator.
5. Replay rules:
   - Merge and normalize `inputEvidenceRefs`: dedupe all refs, reject any extra reserved packet-binding refs that are not exactly `requiredPacketBindingEvidenceRef`; preserve all non-reserved refs plus one required binding ref in the candidate event.
   - If no match for derived `(receiptId, dispatchId, childSessionId, childTaskId)` exists, append `dispatch.started` candidate.
   - If exact projection exists for derived identities, compare its `inputEvidenceRefs`:
     - require the same exact `requiredPacketBindingEvidenceRef` to be present;
     - if present, return `claimStatus: "already_claimed"` (no write).
     - if missing or different digest is present, return `packet_claim_conflict`.
6. Append candidate row only after candidate+current replay validate.
7. Reread and exact-readback-verify bytes before returning.
8. Release lock via validated marker identity.

No helper path may read then append outside this lock-scoped sequence.

## Duplicate, conflict, and non-executable semantics

- Duplicate exact readback (same stable claim identity + matching `requiredPacketBindingEvidenceRef`):
  - `state=valid`, `claimStatus="already_claimed"`, no bytes changed, no side effects.
  - execution must not proceed from duplicate replay.
- Same stable claim identity + different `packetDigest` (visible via reserved binding evidence):
  - fail closed with `code = "packet_claim_conflict"`, no bytes changed.
- Same stable claim identity + non-canonical packet bytes:
  - if canonical packet digest is equal, binding ref is equal and result is `already_claimed`;
  - if canonical packet digest differs, result is `packet_claim_conflict`.

## Crash/uncertain start behavior

- The only executable gate is a durable `dispatch.started` row for that deterministic claim identity.
- If `dispatch.started` append/readback succeeds and returns `claimed`, execution path may proceed.
- Any uncertain/ambiguous result after this boundary (marker loss, short write, sync/readback mismatch, append replay failure, lock-release identity mismatch, etc.) returns explicit uncertain/recovery code and must be treated as **not executable**.
- Restart must consult replay+exact readback before execution and never treat any uncertainty as fresh unclaimed packet.

## Failure-code precedence (closed)

1. `malformed_input` — shape/descriptor/scope invalid.
2. `malformed_packet` — strict JSON parse/canonicalization failure.
3. `unsafe_path` — repo/root/log/lock path violations.
4. `dispatch_receipt_lock_held` — lock contention.
5. `mixed_scope` or replay-invalid codes from existing receipt replay (`receipt_dispatch_collision`, `child_task_reuse`, etc.).
6. `packet_claim_conflict` — same stable claim identity (parentMissionId/parentSessionId/packetId) mapped to different digest.
7. `recovery_required` — any partial/uncertain mutation path (write/readback sync, marker identity mismatch, short write, unreadable append path after intent to write).

`recovery_required` and lock/append uncertainty dominates narrower conflicts and must not be retried as executable.

## Focused test matrix for #173 ACs

Target: `packages/shield-team-system/tests/seat-dispatch-store.test.mjs`

- `claim` succeeds and appends exactly one canonical `dispatch.started` entry.
- Exact duplicate claim for same stable claim identity + same digest returns `state=valid + claimStatus=already_claimed` and preserves bytes.
- Same stable claim identity + different packet bytes returns `packet_claim_conflict`, no mutation.
- Same stable claim identity + equivalent-whitespace canonical packet bytes dedupes to `already_claimed`.
- `inputEvidenceRefs` are normalized by dedupe and merged with required reserved `evidence:packet-binding:seat-dispatch-v1:<claimKey>:<packetDigest>`:
  - exact required ref present in caller input is honored once,
  - additional reserved binding refs with any other digest are rejected,
  - duplicate non-reserved refs are collapsed.
- Non-JSON / malformed JSON packet fails as `malformed_packet` pre-mutation.
- `dispatch.started` only: lifecycle cannot be claimed with non-start kind via claim API.
- `dispatch.started` duplicate with mismatched derived IDs fails at malformed-input boundary.
- Mixed scope / foreign scope / replay invalid / non-canonical ledger errors fail closed and preserve bytes.
- Lock contention and lock-holder marker tamper path do not mutate bytes and preserve replay integrity.
- Uncertain write/readback (forced path failures) returns `recovery_required` and preserves bytes.
- Child session reuse for different packets and same mission is rejected deterministically by derived identity collision rules.
- Concurrent claim simulation: one winner appends, others receive non-executable state or conflict without mutation.

## Validation commands

1. `npm --prefix packages/shield-team-system run build`
2. `node --test packages/shield-team-system/tests/seat-dispatch-store.test.mjs`
3. `node --test packages/shield-team-system/tests/package-surface.test.mjs`
4. `npm --prefix packages/shield-team-system test`
5. `git diff --check`
