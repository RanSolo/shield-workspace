# Issue #248 — Slice 2: relay delivery and acknowledgement

## Exact planning identity

- Repository: `RanSolo/shield-workspace`
- Planning base: `784cedea633d52eae95d54e97686115ee3427e40`
- Issue: #248
- Predecessor: merged Slice 1 in PR #356
- Authority: planning only. This document grants no implementation, delivery, publication, merge, deployment, release, or human authority.

## Outcome

Advance the merged authority-none relay through one durable, inspectable delivery lifecycle without waking an agent or executing a successor:

```text
relay.pending
→ relay.delivered
→ reread exact durable source evidence
→ relay.acknowledged
```

Delivery and acknowledgement remain coordination facts, never authority. This slice ends with an acknowledged relay whose next action is `await_authority_replay`.

## Acceptance criteria

### AC1 — closed create-once lifecycle

- Add digest-bound `relay.delivered` and `relay.acknowledged` lifecycle entries to the existing global and per-relay chains.
- Permit only `pending → delivered → acknowledged`; reject skipped, reversed, repeated-with-conflicting-content, unknown, or post-acknowledgement transitions.
- Exact delivery and acknowledgement retries are explicit byte-stable duplicates and append nothing. A delivery/acknowledgement payload contains only reference identities and digests.
- Preserve `authority: "none"` on every entry and projection. No lifecycle event can satisfy permission, review, acceptance, or execution.

### AC2 — exact recipient and stale-state enforcement

- Delivery binds the existing relay ID/digest, recipient seat, lane, controller identity, repository/workspace identity, source repository revision, and one host-observed delivery receipt ID/digest.
- Acknowledgement binds the exact delivery entry digest, recipient identity, receiver-observation digest, and reread source-terminal entry digest.
- Recipient mismatch, stale source revision, stale delivery identity, missing delivery, duplicate meaning, and conflicting reuse are distinct closed results. Missing delivery is never reported as missing authority; delivered or acknowledged is never reported as authority.
- Slice 2 remains Hill-recipient-only because the merged Slice 1 recipient contract intentionally admits `hill`; widening to arbitrary seats is a separate contract change.

### AC3 — authoritative reread before acknowledgement

- The sole effectful acknowledgement path rereads the durable seat-dispatch receipt ledger through `readSeatDispatchReceiptLedgerV1`, replays it through `replaySeatDispatchReceiptsV1`, and reselects the exact terminal source through the relay's frozen source identity and `lastEntryDigest`.
- Zero, multiple, nonterminal, stale-revision, or mismatched source results fail before acknowledgement append.
- Replay projects `pending`, `delivered`, and `acknowledged` separately. Their advisory next actions are respectively `await_delivery_binding`, `reread_authoritative_state_and_acknowledge`, and `await_authority_replay`.
- This source reread does not claim mission authority exists. Successor classification, authority replay, execute-once claim, agent start/resume, and successor execution are excluded.

## Durable-store requirements

Reuse the merged confined store, lock, exact readback, and monotonic witness. Every lifecycle append must update the relay ledger and witness under the same fail-closed discipline. Partial write, sync/close/readback uncertainty, lock contention, inode replacement, symlink/alias/mode violation, deletion, or rollback cannot report success or duplicate lifecycle meaning.

Do not restore the historical raw caller-controlled mutation exports. Effectful delivery and acknowledgement APIs derive and validate their entries internally from the exact durable relay state and source receipt replay.

## Authorized implementation candidates

- `docs/missions/issue-248-relay-delivery-plan.md`
- `packages/shield-team-system/scripts/operations/feature-flight-relay.mjs`
- `packages/shield-team-system/scripts/operations/feature-flight-relay-store.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-relay.test.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-relay-store.test.mjs`

Historical branch `agent/issue-248-relay-events` may inform lifecycle shapes only. Every reused behavior must be reconciled against merged Slice 1; its raw append APIs and old test results are not reusable evidence.

## Validation

- Focused relay contract/store tests through the `@shield/team-system` Nx target.
- Explicit cases: pending→delivered→acknowledged; exact duplicate retries; conflicting retries; skipped/reversed/post-terminal lifecycle; each recipient field mismatch; stale repository/source/delivery identities; missing delivery versus missing authority; exact durable source reread; malformed/proxy/accessor/unknown-field inputs; canonical byte stability; global/per-relay chain replay.
- Re-run the merged store fault matrix for lifecycle append and witness update.
- Use Nx affected discovery from exact base to exact implementation HEAD. Run cache-enabled `@shield/team-system:build` and `@shield/team-system:test`; record Multiband if affected but do not make its external application environment an acceptance gate.
- `git diff --check` and exact changed-path allowlist verification.

## Explicit exclusions

- No mission-journal authority decision, successor classification, execute-once successor claim, agent/CLI wake or resume, scheduler, active-flight throttle, host-specific remote adapter, chat polling, publication, merge, deployment, release, or final acceptance.

## Human gate

Implementation starts only after Fury passes this exact plan and Coulson turns one Wheels Up key for these five paths. Same-scope corrections remain inside that authority.
