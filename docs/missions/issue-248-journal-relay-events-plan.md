# Issue #248 — journal-backed relay events and clockwork wake-up

## Exact planning identity

- Repository: `RanSolo/shield-workspace`
- Planning base: `2fdae3eb760c639d6d768074e3cdc83d640ab9e8`
- Recovery source: unmerged branch `agent/issue-248-relay-events` at `9ae6809d26eee287c0f07dc4694c09a563d6a7ea`; its three implementation packets are candidates to reconcile, not evidence that current-main conformance already exists.
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

The relay never contains authority and never decides that a successor is legal. Existing journal replay, permission evaluation, Mission Builder status, and `advanceMissionV1` remain the sources of truth. Human gates, material scope changes, ambiguous evidence, failed validation without an authorized repair remaining, exhausted repairs, and final completion surface to Hill instead of auto-advancing. A failed validation with a bounded authorized repair remaining is routine clockwork.

## Acceptance-contract mapping

| ID | Issue requirement | Required proof |
| --- | --- | --- |
| AC1 | Wake the intended active lane without human packet copying | One terminal receipt produces one recipient-scoped pending relay and one host delivery call. |
| AC2 | Receiver rereads authoritative state | No acknowledgement or successor call occurs until exact journal, mission definition/status, and repository revision are reread and validated. |
| AC3 | Delivery lifecycle is explicit | Replay distinguishes emitted, delivery-started, delivered, acknowledged, successor-claimed, successor-recorded, superseded, duplicate, recipient mismatch, and recovery-required states. |
| AC4 | Relay and authority remain distinct | Every artifact declares `authority: "none"`; tests prove a relay cannot satisfy a gate, permission decision, review, or acceptance requirement. |
| AC5 | Payload is compact and host-safe | Delivery receives only relay ID/digest, flight/mission/session identity, registry digest, recipient seat/lane/controller scope, adapter/endpoint identity digests, event kind, source evidence reference, requested observation, and sequence. No prompt, output body, passcode, signer material, or private journal entry is copied. |
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

The host accepts a closed, content-addressed active-controller registry and a delivery adapter as capabilities, not authority. The registry joins flight ID, mission ID, Mission Builder definition revision, parent session, repository/workspace/revision, lane, canonical recipient seat, controller scope, adapter identity, and endpoint identity. `hill` remains the canonical seat; `controlling_hill` and `lane_hill` are controller scopes, never new seats.

The adapter contract supplies create-once delivery under a host-derived idempotency key and a query operation that authoritatively reconciles that same key and target identity. The host appends `relay.delivery_started` and verifies readback before invocation. A crash or exception after that claim may resume only by querying the adapter. Exact accepted delivery is recorded; definitive create-once absence may invoke using the same key; ambiguous observation returns `recovery_required` and never redelivers blindly.

### Source events

V1 recognizes only closed source variants already represented durably:

- the exact terminal `dispatch.completed`, `dispatch.failed`, or `dispatch.cancelled` entry from the seat-dispatch ledger;
- the exact Mission Builder step receipt that changed the graph's current node;
- a signed journal entry that newly satisfies exactly one currently active human gate under the bound mission definition, revision, and parent session. This source wakes the controller but does not claim the graph node changed.

Projected status changes are not source evidence. Free-form thread text, polling timeout, model self-report, bare `done`, and caller-asserted `PACKET_COMPLETE` are not source evidence.

### Event lifecycle

One relay identity is derived from the immutable tuple:

- flight ID, mission ID, and definition revision;
- parent session;
- repository/workspace/revision;
- source kind, source digest, and source sequence;
- active-controller registry digest;
- recipient seat/lane identity and controller scope;
- delivery adapter identity and endpoint-identity digest;
- requested observation.

Cross-domain source selection uses the total tuple `sourceDomain`, `sourceDomainSequence`, `sourceDigest`, where the closed domain order is `mission_journal`, `mission_step`, `seat_dispatch`. Domain sequences are never compared without the domain discriminator.

Lifecycle entries are `relay.emitted`, `relay.delivery_started`, `relay.delivered`, `relay.acknowledged`, `relay.successor_claimed`, `relay.successor_recorded`, and `relay.superseded`. The global log and each relay lifecycle are digest chained. Exact retries return the existing projection; conflicting reuse fails closed. `relay.superseded` binds the newer authoritative mission/controller tuple that made the pending relay stale. Acknowledgement binds the receiver observation digest and the authoritative state digest it replayed.

The successor identity is derived from relay ID, authoritative-state digest, definition revision, current node, selected transition, and expected effect/receipt identity. `relay.successor_claimed` is appended and read back before calling `advanceMissionV1`. Its exact result, Mission Builder step-receipt digest, and any dispatch/effect receipt digests are then stored in `relay.successor_recorded`. Restart reconciles an incomplete claim only from those authoritative receipts; absence or ambiguity is `recovery_required`, never a blind second call.

## Clockwork algorithm

1. Snapshot and replay the complete source receipt ledger; reject malformed or ambiguous history.
2. Snapshot and replay the relay ledger; reject malformed, unsafe, or uncertain storage.
3. Validate the exact active-controller registry snapshot and select the next unrelayed source by the total cross-domain ordering tuple and deterministic recipient mapping.
4. Append `relay.emitted` create-once and verify exact readback.
5. Append/read back `relay.delivery_started` with adapter idempotency key and target identity.
6. Reconcile that key through the queryable adapter; create once only after definitive absence, then append/read back `relay.delivered` with the adapter receipt. Ambiguity returns `recovery_required`.
7. Receiver validates recipient/controller identity, rereads the signed mission journal, mission definition/provenance, step receipts, dispatch receipts, live repository state, and permission context.
8. If the authoritative tuple is newer, append `relay.superseded`; otherwise append `relay.acknowledged`, binding the observation digests, and verify readback.
9. Project Mission Builder status and apply the exhaustive pre-call table below.
10. For `routine_successor`, derive the closed successor identity, append/read back `relay.successor_claimed`, then call `advanceMissionV1` once with the reread observation.
11. Append/read back `relay.successor_recorded` with the exact result and receipt digests. All non-routine classes surface a compact Hill packet and perform no successor effect.
12. Restart replays all ledgers. It reconciles delivery claims through the adapter and successor claims through authoritative receipts; unresolved claims return `recovery_required`.

## Exhaustive successor classification

### Before `advanceMissionV1`

| Mission status / observation | Relay disposition |
| --- | --- |
| `ready` at a Runner or Mack node, with exact current authority and attempts remaining | `routine_successor` |
| `waiting` / `human_gate` with exactly one newly satisfying signed evidence entry | `routine_successor` |
| `waiting` / `human_gate` without that evidence | `human_gate` |
| `blocked` / `repair_exhausted`, or validation failure without a bounded authorized repair | `authority_or_scope_conflict` |
| validation failure with a bounded authorized repair and attempts remaining | `routine_successor` |
| `complete` / `terminal` | `complete` |
| null status, `invalid_replay`, malformed/ambiguous durable input, or uncertain readback | `recovery_required` |
| stale definition/provenance/permission, unsupported effect, exhausted capability, or repository/scope mismatch | `authority_or_scope_conflict` |
| separately evidenced host/runtime/adapter unavailability with intact authority and replay | `external_blocker` |

### After `advanceMissionV1`

Every `MissionAdvanceResultV1` value is mapped before `relay.successor_recorded`:

| Outcome / reason | Relay disposition |
| --- | --- |
| `advanced` / `complete` | record exact successor receipt/result; the resulting durable step receipt may emit the next relay |
| `complete` / `complete` | `complete` |
| `waiting` / `human_evidence_required` | `human_gate` |
| `blocked` / `repair_exhausted` | `authority_or_scope_conflict` |
| `blocked` with `observation_mismatch`, `provenance_stale`, or `proofreading_required` | `authority_or_scope_conflict` |
| `blocked` or `waiting` with `runner_blocked` or `mack_blocked` | `external_blocker` only when the nested result durably identifies host/environment unavailability; otherwise `authority_or_scope_conflict` |
| `blocked` with `input_invalid`, `definition_invalid`, `receipt_invalid`, `receipt_conflict`, or `readback_mismatch` | `recovery_required` |
| `uncertain` / `uncertain_execution` | `recovery_required` |
| any outcome/reason/status combination outside the closed table | `recovery_required` |

A signed human-evidence source and the later node-changing human step receipt are different ordered sources. The first wakes the controller to record the edge; the second may wake the next recipient. Their domain, sequence, and digest identities prevent duplicate interpretation.

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

- Add the active-controller registry, queryable create-once delivery/acknowledgement adapter seams, and Feature Flight inspection.
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
6. delivery claim/reconciliation uncertainty;
7. authoritative journal, repository, runtime, permission, or mission-status reread failure;
8. acknowledgement uncertainty;
9. successor classification or bounded execution result.

No later failure may mask an earlier malformed or uncertain durable state.

## Required validation

- Nx affected build/test from exact planning base; the expected affected project is only `@shield/team-system`.
- Focused Team System relay store/host/package-surface tests.
- Packed-install `shield-ops` consumer proof; the relay remains an internal operations/CLI seam with no new public declaration export.
- Full-suite validation on Node.js `24.18.0`.
- Run the cache-enabled exact affected target set from planning base `2fdae3eb760c639d6d768074e3cdc83d640ab9e8` to the implementation revision, plus focused relay/controller tests. Persist command, exact base/head, affected project set, cache outcome, exit code, and output digest. Do not invoke Multiband when Nx does not classify it as affected.
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
