# Issue #248 — Slice 3: authoritative relay acknowledgement

## Exact planning identity

- Repository: `RanSolo/shield-workspace`
- Planning base: `7ced25d39e256cf794c56c0f17799d7b751b21a0`
- Issue: #248
- Predecessors: merged Slice 1 in PR #356 and Slice 2 in PR #357
- Authority: planning only. This document grants no implementation, acknowledgement, publication, merge, deployment, release, or human authority.

## Outcome

Advance one delivered authority-none relay only after the receiving Hill path rereads and exactly verifies the authoritative dispatch receipt ledger:

```text
relay.delivered
→ reread/replay authoritative dispatch ledger
→ verify exact terminal projection and terminal entry
→ relay.acknowledged
```

This slice proves receipt and authoritative observation. It does not wake or resume an agent and does not classify or execute a successor.

## AC1 — closed authority-none acknowledgement contract

- Add `shield.feature-flight-relay.acknowledged.v1` and one lifecycle entry `relay.acknowledged` at lifecycle sequence 2. Preserve literal Slice 1 pending/genesis and Slice 2 delivered bytes and semantics without rewrite.
- The acknowledged entry binds the relay ID/digest, delivered entry/delivery receipt digest, complete recipient tuple, repository/workspace/revision, dispatch receipt/dispatch IDs, and the exact authoritative terminal entry kind, digest, log sequence, and lifecycle sequence.
- Its acknowledgement material and digest are derived internally from a validated delivered entry plus the authoritative replay result. Callers cannot supply lifecycle kind, acknowledgement outcome, terminal evidence, entry, or digest.
- Every acknowledgement artifact and projection remains `authority: "none"` and states explicitly that it grants no permission, approval, acceptance, execution, wake/resume, or successor authority.
- Replay accepts exactly `pending → delivered → acknowledged`; rejects skipped, repeated, reversed, unknown, conflicting, and post-acknowledgement transitions.

## AC2 — authoritative reread before acknowledgement

- Add one effectful acknowledgement API in the existing confined relay store. Its closed input contains only canonical repository/store scope and expected frozen relay, source, recipient, and revision identities.
- Under the existing relay lock, reread/replay the durable relay ledger and select exactly one delivered relay. Then invoke the existing `readSeatDispatchReceiptLedgerV1` and `replaySeatDispatchReceiptsV1` seams against the frozen repository/workspace identity.
- Select exactly one authoritative dispatch projection matching every immutable source identity. Require a terminal state and exactly one terminal entry matching `lastEntryDigest`, terminal kind, receipt/dispatch IDs, log sequence, lifecycle sequence, and the relay's frozen terminal reference.
- Missing, malformed, unsafe, ambiguous, non-terminal, stale, or mismatched authoritative evidence fails before acknowledgement append. Repository revision is a frozen identity; this slice does not inspect live Git or infer mission-authority freshness.
- After exact verification, append the acknowledgement and monotonic witness through the existing append/sync/readback machinery. Exact retry returns `duplicate` only after lock acquisition and exact acknowledgement reconciliation.
- Freeze the recovery windows: before acknowledgement append, retry normally; after exact acknowledgement-and-witness readback but before return, retry reconciles as `duplicate`; ledger/witness skew, uncertain append, or a process crash retaining the lock returns `recovery_required`, with no duplicate and no automatic lock removal. Automatic skew or stale-lock repair is outside this slice.

## AC3 — Hill inspection and closed precedence

- Retain three backward-compatible inspection states: `pending`, `delivered`, and `acknowledged`.
- Existing next actions remain `await_delivery_binding` and `reread_authoritative_state_and_acknowledge`. Acknowledged projects `no_automatic_action`; wake/resume and successor dispatch remain excluded.
- Inspection exposes compact references only and distinguishes pending, delivered, and acknowledged without treating any relay state as authority.
- Literal Slice 1 and Slice 2 ledgers must produce deep-equal pre-Slice-3 entries, projections, and inspection objects. Preserve every existing contract version, notice, field, conditional property, and omission rule: in particular, omit `acknowledged` when empty and add it only when the ledger contains an acknowledged lifecycle.
- Closed acknowledgement results are: `relay_missing`, `delivery_missing`, `source_ledger_unavailable`, `source_replay_invalid`, `terminal_source_ambiguous`, `terminal_source_required`, `terminal_source_mismatch`, `recipient_mismatch`, `source_stale`, `duplicate`, `conflicting_reuse`, `illegal_transition`, and `recovery_required`.
- Deterministic precedence is: malformed invocation; unsafe/unreplayable relay store; exact relay/repository/workspace/recipient selection; existing acknowledgement/lifecycle classification under lock; authoritative ledger read and replay; exact terminal projection/entry binding; acknowledgement/witness append and exact readback; inspection projection.
- Source result mapping is closed: expected-versus-relay revision disagreement before source access is `source_stale`; thrown reads, missing store, unavailable repository/receipt, unsafe path, or read uncertainty are `source_ledger_unavailable`; malformed, mixed-scope, digest/sequence/lifecycle/identity, or other replay-integrity failures are `source_replay_invalid`. Relay lock-release, close, append, or readback uncertainty overrides provisional success or duplicate with `recovery_required`.

## Durable-store and compatibility requirements

Reuse the merged store root, lock, exact readback, monotonic witness, and no-follow filesystem protections. Do not create a second acknowledgement store or restore raw caller-controlled append APIs. Deletion, rollback, partial write, sync/close/readback uncertainty, symlink/alias/mode/inode replacement, or lock contention cannot report success or duplicate acknowledgement meaning.

Literal Slice 1 pending/genesis fixtures and a literal canonical Slice 2 delivered entry captured from planning base `7ced25d39e256cf794c56c0f17799d7b751b21a0` must replay unchanged; reconstructed fixtures alone are insufficient.

## Authorized implementation candidates

- `docs/missions/issue-248-relay-acknowledgement-plan.md`
- `packages/shield-team-system/scripts/operations/feature-flight-relay-store.mjs`
- `packages/shield-team-system/scripts/operations/feature-flight-relay.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-relay-store.test.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-relay.test.mjs`

## Validation

- Focused relay contract/store tests through the `@shield/team-system` Nx target.
- Explicit cases: exact terminal reread; non-terminal/missing/malformed/ambiguous/stale dispatch ledger and every closed source-result mapping; every source/recipient/revision mismatch; delivered→acknowledged; exact retry; retry before append; duplicate after exact acknowledgement-and-witness readback; ledger/witness skew, retained-lock crash, uncertain append, and held-lock retry as `recovery_required`; conflicting/skipped/reversed/post-ack transitions; acknowledgement/witness fault matrix; compact inspection; literal Slice 1 and Slice 2 bytes plus deep-equal legacy replay/projection/inspection output and conditional omission of empty acknowledgement state.
- Use Nx affected discovery from exact base to exact implementation HEAD. Run cache-enabled `@shield/team-system:build` and `@shield/team-system:test`; record Multiband if affected but keep its external application environment non-gating.
- Run `git diff --check` and exact changed-path allowlist verification.

## Explicit exclusions

No mission-authority decision, successor classification, execute-once successor claim, agent/CLI wake or resume, scheduler, active-flight throttle, remote host adapter, chat polling, publication, merge, deployment, release, or final acceptance.

## Human gate

Implementation starts only after Fury passes this exact plan and Coulson turns one Wheels Up key for these five paths. Same-scope corrections remain inside that authority.
