# Issue #171 Daisy reconnaissance

## Identity and authority

- Mission: `mission:issue-171`
- Mission revision: `sha256:5ud527SOimvIoD4fXhxEoWBHxtuTm5mkppa6WT8g91s`
- Repository revision: `b8bba50510423591fa5e1e6d874c8176ea162353`
- Accountable seat: Daisy
- Reasoning runtime: local Daisy (`ornith-1.0-35b`)
- Adapter: `scripts/model/ask-local.mjs`
- Authority: read-only advisory reconnaissance; no tool or implementation authority

## Packet observations

| Packet | Context | Result |
| --- | --- | --- |
| Permission audit store | mission brief, `permission-audit-v1.mts`, `mission-store.mts` | 8,369 input / 854 output tokens; 11.16s TTFT; 64.26 tok/s; usable bounded handoff |
| May control-event contract | `public/local-tools.d.mts` | 2,664 input / 366 output tokens; 3.48s TTFT; 57.89 tok/s; concise usable handoff |
| Mission runtime source | full `mission-runtime-v1.mts` | no usable message returned; the packet was discarded rather than treated as evidence |

The smaller contract packet was substantially faster and cleaner. Large whole-module context did not improve usable output in this run.

## Observed repository facts

1. `PermissionAuditAppender` exists in `src/permission-audit-v1.mts`; record validation, canonical digest calculation, receipt validation, and ledger replay are already implemented.
2. No production filesystem implementation of `PermissionAuditAppender` exists. `src/mission-store.mts` and `src/seat-dispatch-store.mts` provide nearby confinement, locking, append, sync, readback, and recovery patterns.
3. `MayControlLoopDependencies.appendControlEvent` accepts a closed `MayControlEvent` with schema version 1, non-authoritative classification, event/session identity, counter, optional tool-call identity, and evidence references. It requires an exact `{ eventId, appended: true }` acknowledgement.
4. No production May control-event store or readback contract exists.
5. `runMissionCycle(...)` consumes a schema-9 profile-aware journal and injects `permissionAudit` plus `getPermissionContext(...)`. The returned permission context must validate as schema 9, exact-match the derived decision ID, and exact-match required capabilities.
6. The schema-9 profile-aware projection does not itself contain an active runtime-binding collection. The older supervised v6-v8 contract does, but #171 may not reinterpret or upgrade schema-v2 evidence or transplant authority between journal contracts.
7. No production caller of `runMissionCycle(...)` currently composes these injected sources.

## Daisy recommendations for May to challenge

- Add a dedicated filesystem permission-audit store by reusing existing store safety patterns; do not redesign the audit record contract.
- Add a separate durable May control-event store with closed append/readback semantics; keep events explicitly non-authoritative.
- Treat the schema-9 execution-scope/runtime-binding source as the architecture decision. It must come from separately authorized durable evidence and exact runtime/executor observation, not packet fields or a schema-v2 journal.
- Keep the implementation in independently reviewable slices and validate store uncertainty and restart behavior before composition.

## Unresolved questions for Fury

- Whether the runtime-binding source should extend the profile-aware journal, use a separate durable binding store, or compose an existing exact-attribution record without changing either authority contract.
- Whether permission-audit receipts are reconstructed from persisted records or stored as separate durable entries.
- Exact event-code grammar, counter scope, duplicate-event behavior, and readback query for May control events.
