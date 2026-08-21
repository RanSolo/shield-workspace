# Issue #248 — Slice 2: relay delivery and acknowledgement

## Exact planning identity

- Repository: `RanSolo/shield-workspace`
- Planning base: `784cedea633d52eae95d54e97686115ee3427e40`
- Issue: #248
- Predecessor: merged Slice 1 in PR #356
- Authority: planning only. This document grants no implementation, delivery, publication, merge, deployment, release, or human authority.

## Outcome

Advance one merged authority-none relay through one real, local, queryable delivery effect without waking an agent or claiming acknowledgement:

```text
relay.pending
→ query/create/read back recipient-scoped local inbox receipt
→ relay.delivered
```

This smaller slice supplies the trusted producer missing from the first plan. It ends at `relay.delivered` with next action `reread_authoritative_state_and_acknowledge`. Acknowledgement and successor execution remain later slices.

## Acceptance criteria

### AC1 — queryable create-once local delivery provider

- Add one repository-local Hill inbox provider inside the confined relay store root. Its deterministic delivery key is SHA-256 over the relay ID/digest, repository/workspace identity, source repository revision, and the complete frozen recipient tuple: seat, lane, and controller identity.
- The sole exported effectful delivery API accepts only store scope plus expected frozen relay/recipient identities. It rereads the durable relay store, selects exactly one pending relay, derives the key, queries before effect, creates with no-follow/exclusive semantics when absent, syncs, queries after effect, and requires exact readback.
- The provider internally derives a closed authority-none delivery receipt containing only the delivery key, relay ID/digest, complete recipient binding, repository/workspace/revision references, and receipt digest. Callers cannot supply lifecycle kind, entry, outcome, delivery receipt, or receipt digest.
- Exact retry queries and returns the identical receipt without another effect. A crash after receipt creation but before relay append is reconciled by querying that same deterministic receipt and appending the same delivered entry. Uncertain or non-queryable effect returns `recovery_required` and appends nothing.
- This local provider delivers only to the existing Hill recipient frozen by Slice 1. Filesystem confinement plus exact frozen recipient matching is the provider identity boundary; arbitrary-seat delivery and remote host adapters are excluded.

### AC2 — backward-compatible delivered lifecycle

- Preserve every canonical Slice 1 relay/genesis entry byte, digest, store filename, witness, and replay result without rewrite. The pending-v1 relay remains the lifecycle genesis.
- Add one closed, versioned `relay.delivered` entry schema and digest domain with lifecycle sequence 1, exact genesis lifecycle predecessor digest, global predecessor digest, and internally derived delivery receipt identity.
- Replay accepts exactly `pending → delivered`; rejects a second pending, skipped/reversed/unknown/post-delivery entries, conflicting reuse, and malformed chains. Exact already-durable delivery retry returns `duplicate` without another provider effect or ledger append.
- Projection states are exactly `pending` and `delivered`, with next actions `await_delivery_binding` and `reread_authoritative_state_and_acknowledge`. Both remain `authority: "none"` and cannot satisfy permission, review, acceptance, acknowledgement, or execution.
- Prove compatibility with literal canonical pending relay and genesis-entry bytes captured from base `784cedea633d52eae95d54e97686115ee3427e40`; rebuilding the fixture through revised constructors is insufficient.

### AC3 — closed outcomes and deterministic precedence

- Closed delivery results distinguish: `relay_missing`, `delivery_missing`, `recipient_mismatch`, `source_stale`, `delivery_stale`, `duplicate`, `conflicting_reuse`, `illegal_transition`, and `recovery_required`. Missing delivery is never reported as missing authority, and delivered is never reported as authority.
- Source staleness means disagreement among the expected delivery input, frozen relay source, and persisted local receipt; it does not inspect live Git or claim mission-authority freshness.
- Evaluate in this order: malformed invocation; unsafe/unreplayable relay or inbox store; exact relay/repository/workspace and seat/lane/controller selection; existing receipt/lifecycle classification; provider query/create/query; relay/witness append and exact readback.
- Exact already-durable retries intentionally return duplicate after exact relay/receipt reconciliation and do not re-run an external source or authority read. Acknowledgement will own durable dispatch-ledger reread in the next slice.

## Durable-store requirements

Reuse the merged confined root, lock, exact readback, and monotonic witness. The inbox receipt and delivered lifecycle append are independently queryable and restart-reconcilable. Partial write, sync/close/readback uncertainty, lock contention, inode replacement, symlink/alias/mode violation, deletion, or rollback cannot report success or duplicate delivery meaning.

Do not restore historical raw caller-controlled mutation exports.

## Authorized implementation candidates

- `docs/missions/issue-248-relay-delivery-plan.md`
- `packages/shield-team-system/scripts/operations/feature-flight-relay.mjs`
- `packages/shield-team-system/scripts/operations/feature-flight-relay-store.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-relay.test.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-relay-store.test.mjs`

Historical branch `agent/issue-248-relay-events` may inform lifecycle shapes only. Every reused behavior must be reconciled against merged Slice 1; its raw append APIs and old test results are not reusable evidence.

## Validation

- Focused relay contract/store tests through the `@shield/team-system` Nx target.
- Explicit cases: pending→delivered; exact provider and lifecycle retries; crash after provider receipt before ledger append; conflicting retries; skipped/reversed/post-delivery lifecycle; each recipient field mismatch; stale repository/source/delivery identities; missing delivery versus missing authority; malformed/proxy/accessor/unknown-field inputs; literal Slice 1 compatibility bytes; canonical byte stability; global/per-relay chain replay.
- Re-run the merged store fault matrix for inbox receipt creation, lifecycle append, and witness update.
- Use Nx affected discovery from exact base to exact implementation HEAD. Run cache-enabled `@shield/team-system:build` and `@shield/team-system:test`; record Multiband if affected but do not make its external application environment an acceptance gate.
- `git diff --check` and exact changed-path allowlist verification.

## Explicit exclusions

- No acknowledgement, dispatch-ledger reread, mission-journal authority decision, successor classification, execute-once successor claim, agent/CLI wake or resume, scheduler, active-flight throttle, remote host adapter, chat polling, publication, merge, deployment, release, or final acceptance.

## Human gate

Implementation starts only after Fury passes this exact plan and Coulson turns one Wheels Up key for these five paths. Same-scope corrections remain inside that authority.
