# Issue #248 — journal-backed relay events and clockwork wake-up

## Exact planning identity

- Repository: `RanSolo/shield-workspace`
- Planning base: `cdaf96fcfff069cbce36c8136eb87a17f2da36a6`
- Issue: #248
- Related orchestration objective: #167
- Authority: planning only; this document grants no implementation, dispatch, publication, merge, deployment, release, or human authority.

## Bounded outcome

Add one durable, authority-neutral wake-up path for an active mission controller:

```text
durable terminal dispatch receipt or reviewed journal transition
→ derive one recipient-scoped relay event
→ append/replay it idempotently
→ deliver only its compact reference
→ receiver rereads authoritative journal and controller state
→ acknowledge the observed relay
→ run at most one already-authorized routine successor
```

The relay never contains authority and never decides that a successor is legal. Existing journal replay, permission evaluation, Mission Builder status, and `advanceMissionV1` remain the sources of truth. Human gates, material scope changes, ambiguous evidence, failed validation, exhausted repairs, and final completion surface to Hill instead of auto-advancing.

## Acceptance-contract mapping

| ID | Issue requirement | Required proof |
| --- | --- | --- |
| AC1 | Wake the intended active lane without human packet copying | One terminal receipt produces one recipient-scoped pending relay and one host delivery call. |
| AC2 | Receiver rereads authoritative state | No acknowledgement or successor call occurs until exact journal, mission definition/status, and repository revision are reread and validated. |
| AC3 | Delivery lifecycle is explicit | Replay distinguishes pending, delivered, acknowledged, stale, duplicate, recipient mismatch, and recovery-required states. |
| AC4 | Relay and authority remain distinct | Every artifact declares `authority: "none"`; tests prove a relay cannot satisfy a gate, permission decision, review, or acceptance requirement. |
| AC5 | Payload is compact and host-safe | Delivery receives only relay ID/digest, mission/session identity, recipient, event kind, source evidence reference, requested observation, and sequence. No prompt, output body, passcode, signer material, or private journal entry is copied. |
| AC6 | Feature Hill can inspect state | A read-only projection lists exact pending and acknowledged relays with their stop/next-action classification. |
| AC7 | Terminal states turn the next gear | `PACKET_COMPLETE`, successful validation, and technical review completion invoke at most one routine successor when authoritative replay says it is ready. |
| AC8 | Stops are actionable | Human gate, external blocker, scope/authority conflict, recovery requirement, and completion return exact revision, completed evidence, active seat/gear, performed effects, boundary, and smallest legal next action. |

## Architecture decision

### Existing Nx boundary

Keep this slice inside the existing `@shield/team-system` Nx project. Reconnaissance found that Feature Flight already owns the required canonical value helpers, durable create-only store patterns, terminal arbitration, recovery projections, controller status, and host adapter boundary. A new package would duplicate those semantics and add package/linking ceremony without isolating an independent capability.

Add a closed authority-neutral relay contract beside the Feature Flight operations. It owns only compact relay identity, lifecycle replay, inspection projection, and the host seam described below. It does not create a new journal entry type or alter Team System's authority contracts.

### Feature Flight relay host

The host reuses:

- durable seat-dispatch lifecycle receipts in `seat-dispatch-receipt-v1.mts` and `seat-dispatch-store.mts`;
- exact mission graph/status and bounded successor execution in `mission-builder-v1.mts`;
- Feature Flight structural projection in `feature-flight-controller.mjs`;
- repository, journal, runtime, and permission replay.

The host accepts a configured recipient registry and delivery adapter as capabilities, not authority. It derives relay identity from a verified terminal source record plus mission/session/repository identity. It appends the pending relay before delivery, records delivery/acknowledgement durably, rereads all authoritative inputs, and then calls `advanceMissionV1` at most once. Adapter failure leaves a replayable pending relay and performs no successor effect.

### Source events

V1 recognizes only closed terminal sources already represented durably:

- `dispatch.completed`, `dispatch.failed`, or `dispatch.cancelled` from the seat-dispatch ledger;
- a Mission Builder status transition whose exact evidence is already durable and whose next node is deterministically derivable.

Free-form thread text, polling timeout, model self-report, bare `done`, and caller-asserted `PACKET_COMPLETE` are not source evidence.

### Event lifecycle

One relay identity is derived from the immutable tuple:

- mission and definition revision;
- parent session;
- repository/workspace/revision;
- source kind, source digest, and source sequence;
- recipient seat/lane identity;
- requested observation.

Lifecycle entries are `relay.emitted`, `relay.delivered`, and `relay.acknowledged`. The global log and each relay lifecycle are digest chained. Exact retries return the existing projection; conflicting reuse fails closed. Acknowledgement binds the receiver observation digest and the authoritative state digest it replayed.

## Clockwork algorithm

1. Snapshot and replay the complete source receipt ledger; reject malformed or ambiguous history.
2. Snapshot and replay the relay ledger; reject malformed, unsafe, or uncertain storage.
3. Select the next unrelayed terminal source by source sequence and deterministic recipient mapping.
4. Append `relay.emitted` create-once and verify exact readback.
5. Deliver only the compact reference through the configured host adapter.
6. Append `relay.delivered` and verify exact readback. Delivery uncertainty returns `recovery_required`; it does not redeliver blindly.
7. Receiver validates recipient identity, rereads the signed mission journal, mission definition/provenance, step receipts, dispatch receipts, live repository state, and permission context.
8. Receiver appends `relay.acknowledged`, binding those observation digests, and verifies readback.
9. Project Mission Builder status. Classify exactly one of `routine_successor`, `human_gate`, `external_blocker`, `authority_or_scope_conflict`, `recovery_required`, or `complete`.
10. Only `routine_successor` may call `advanceMissionV1`, once, with the reread observation. All other classes surface a compact Hill packet and perform no successor effect.
11. Restart replays both ledgers and resumes from the last durable lifecycle state without reconstructing or duplicating authority.

## Rapid-strike packets

These are implementation packets inside one Delivery Session, not separate missions or PIN gates.

### Packet 1 — closed relay contract and replay

- Build the Feature Flight relay contract, canonical identity, lifecycle replay, and inspection projection inside Team System operations.
- Prove hostile-object rejection, global/lifecycle chain integrity, exact retry, conflicting reuse, recipient mismatch, compact-field limits, and explicit authority-none semantics.

### Packet 2 — durable store and source derivation

- Add the confined no-follow append/read store in Team System.
- Derive one relay from exact seat-dispatch/Mission Builder terminal evidence.
- Prove partial write, sync/close/readback failure, lock uncertainty, symlink/alias/replacement attacks, concurrency, restart, and no duplicate source delivery.

### Packet 3 — receiver and one-step clockwork host

- Add configured delivery/acknowledgement adapter seams and Feature Flight inspection.
- Reread authoritative state before acknowledgement and successor selection.
- Route only `routine_successor` into one `advanceMissionV1` call; surface all valid stop classes.
- Prove successful automatic gear movement, human-gate stop, malformed/stale source, wrong recipient, delivery uncertainty, post-delivery drift, process restart, and at-most-one successor effect.

## Expected implementation paths

- `docs/missions/issue-248-journal-relay-events-plan.md`
- `docs/operations/feature-flight-relay.md`
- `packages/shield-team-system/scripts/operations/feature-flight-relay.mjs`
- `packages/shield-team-system/scripts/operations/feature-flight-relay-store.mjs`
- `packages/shield-team-system/scripts/operations/feature-flight-controller.mjs`
- `packages/shield-team-system/scripts/operations/feature-flight-run.mjs`
- `packages/shield-team-system/scripts/operations/ops-cli.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-relay.test.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-relay-store.test.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-controller.test.mjs`
- `packages/shield-team-system/tests/operations-feature-flight-run.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`

`seat-dispatch-receipt-v1.mts`, `seat-dispatch-store.mts`, `mission-builder-v1.mts`, mission journals, permission evaluators, signers, and Feature Flight stores are reuse-only. If implementation proves a required seam is unavailable, stop for Fury disposition instead of duplicating it.

## Failure precedence

1. malformed invocation, unsafe root, or malformed recipient configuration;
2. malformed or ambiguous source receipt/provenance replay;
3. malformed, unsafe, or uncertain relay store;
4. source identity, mission/session/repository/revision, or recipient mismatch;
5. duplicate/conflicting relay identity or lifecycle chain;
6. delivery uncertainty;
7. authoritative journal, repository, runtime, permission, or mission-status reread failure;
8. acknowledgement uncertainty;
9. successor classification or bounded execution result.

No later failure may mask an earlier malformed or uncertain durable state.

## Required validation

- Nx affected build/test from exact planning base; the expected affected project is only `@shield/team-system`.
- Focused Team System relay store/host/package-surface tests.
- Full `@shield/team-system` suite on the repository-supported Node version; separately classify the known Node 22 failures tracked by #302.
- Installed-consumer package import and declaration proof.
- `git diff --check` and exact changed-path allowlist verification.

## Exclusions

- No new authority class, signer, journal evidence kind, review verdict, or human-seat simulation.
- No passcode handling, publication, merge, deployment, release, ready-for-review, or final acceptance.
- No copying prompts, model output bodies, private journal entries, credentials, or signer material into relay payloads.
- No polling timeout as liveness evidence.
- No unbounded loop, multi-successor batch, blind retry after uncertain delivery, or automatic repair of malformed history.
- No generic chat transport implementation; hosts provide a bounded delivery capability.

## Human gate

Implementation begins only after Fury passes the exact committed plan and Coulson turns one Wheels Up key for its bounded paths and effects. The three packets run under that one Delivery Session. Same-scope corrections require no additional PIN.
