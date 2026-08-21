# Issue #248 — Slice 1: durable wake-up signal

## Exact planning identity

- Repository: `RanSolo/shield-workspace`
- Planning base: `2fdae3eb760c639d6d768074e3cdc83d640ab9e8`
- Issue: #248
- Parent objective: #167
- Historical recovery source: unmerged branch `agent/issue-248-relay-events` at `9ae6809d26eee287c0f07dc4694c09a563d6a7ea`
- Authority: planning only. This plan grants no implementation, dispatch, publication, merge, deployment, release, or human authority.

## Outcome

Create the smallest durable signal that lets a controller notice completed work without polling a chat:

```text
exact terminal seat-dispatch receipt
→ compact recipient-scoped authority-none relay
→ create-once durable append
→ deterministic replay and pending projection
```

This slice does not deliver the relay to an agent and does not execute a successor. It establishes the content-addressed event and durable replay seam that the next #248 slice can consume.

## Acceptance criteria

### AC1 — exact compact relay identity

- Read the ledger through `readSeatDispatchReceiptLedgerV1`, replay it through `replaySeatDispatchReceiptsV1`, select exactly one terminal projection, and match its terminal entry through `lastEntryDigest`. Reject zero or multiple matches. Do not use `evaluateSeatDispatchAttributionV1` as the terminal selector because attribution intentionally accepts only completed work.
- Accept only replayed terminal `dispatch.completed`, `dispatch.failed`, or `dispatch.cancelled` evidence; reject started, interrupted, and resumed entries.
- Derive the relay ID as SHA-256 over canonical bytes with domain `shield.feature-flight-relay.pending.v1` and the exact ordered tuple: receipt ID, dispatch ID, parent mission ID/revision/session, child task/session, source accountable seat, repository ID/workspace/revision, subject ID/revision, artifact ID/revision, terminal kind, terminal entry digest, global log sequence, lifecycle sequence, recipient seat, recipient lane, recipient controller identity, and requested observation.
- Keep `sourceAccountableSeatId`, `recipientSeatId`, lane, and controller identity as separate required values; never infer one from another.
- Emit only references and digests. The relay declares `authority: "none"` and contains no prompt, model output, passcode, signer material, credentials, or private journal entry.
- Reject malformed, stale, ambiguous, unsupported, proxy/accessor, unknown-field, and recipient-mismatch inputs.

### AC2 — create-once durable replay

- Append exactly one `relay.pending` event through a confined no-follow store with a global digest chain and one-entry per-relay lifecycle. Delivery, acknowledgement, consumption, and successor lifecycle entries are unsupported in Slice 1.
- Exact replay is idempotent and byte-stable; conflicting identity reuse fails closed.
- Partial write, sync/close/readback failure, lock uncertainty, concurrency, interruption, symlink, alias, mode, inode replacement, and rollback never produce false success or duplicate relay meaning.
- Recovery returns a closed `recovery_required` result when exact durable state cannot be proven.

### AC3 — useful inspection projection

- Project pending relays with exact relay/source/recipient identity, lifecycle state `pending`, repository revision, and the closed advisory next action `await_delivery_binding`.
- A bare model/thread status, polling timeout, caller-supplied `done`, or prose `PACKET_COMPLETE` cannot create a relay.
- The projection is advisory and cannot satisfy authority, permission, review, acceptance, or execution gates.

## Reuse boundaries

Reuse without modifying:

- `replaySeatDispatchReceiptsV1` and terminal event contracts in `src/seat-dispatch-receipt-v1.mts`;
- durable receipt reads in `src/seat-dispatch-store.mts`;
- canonical value and durable-store patterns already used by Feature Flight.

Do not add a new human authority, signer, journal evidence kind, seat, or mission state. Do not modify Mission Builder or invoke `advanceMissionV1` in this slice.

## Authorized implementation candidates

- `docs/missions/issue-248-journal-relay-events-plan.md`
- `packages/shield-team-system/scripts/operations/feature-flight-relay.mjs`
- `packages/shield-team-system/scripts/operations/feature-flight-relay-store.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-relay.test.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-relay-store.test.mjs`

The implementation may recover code from the historical branch only after reconciling every imported symbol and behavior against the exact current base. No historical test result is current evidence.

## Failure precedence

1. malformed or unsafe invocation;
2. malformed or ambiguous terminal source replay;
3. source mission/session/repository/revision or recipient mismatch;
4. malformed or unsafe relay store;
5. duplicate/conflicting relay identity;
6. uncertain append, sync, close, or readback;
7. advisory projection failure.

No later failure may mask an earlier malformed or uncertain durable state.

## Validation

- Focused relay contract and store tests through the `@shield/team-system` Nx target.
- Explicit contract cases: completed/failed/cancelled accepted; started/interrupted/resumed rejected; malformed or ambiguous replay rejected; every source and recipient identity mismatch rejected.
- Explicit store cases: exact retry without append, conflicting identity, canonical-byte stability, global/per-relay chain replay, concurrent claim, partial write, sync/close/readback uncertainty, interruption, symlink/alias/mode/inode replacement, and rollback recovery.
- Cache-enabled Nx affected build/test from exact base to exact implementation HEAD.
- Confirm the affected project set; do not run Multiband unless Nx classifies it as affected.
- `git diff --check` and exact changed-path allowlist verification.

## Explicit exclusions

- No host delivery adapter, acknowledgement effect, agent wake/resume call, successor claim, or `advanceMissionV1` execution.
- No polling loop, chat transport, multi-source ordering, active-flight resource throttle, or multi-lane scheduler.
- No publication, PR mutation, merge, deployment, release, ready-for-review, or final acceptance.

## Next slice

After this slice is exact-head validated and technically accepted, #248 Slice 2 may bind an active-controller registry, deliver the compact relay through a queryable create-once adapter, reread authoritative state, and execute at most one already-authorized routine successor.

## Human gate

Implementation starts only after Fury passes this exact plan and Coulson turns one Wheels Up key for these five paths. Same-scope corrections remain inside that delivery authority.
