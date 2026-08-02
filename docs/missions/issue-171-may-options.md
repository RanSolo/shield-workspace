# Issue #171 May architecture options

## Identity and authority

- Mission: `mission:issue-171`
- Repository revision: `b8bba50510423591fa5e1e6d874c8176ea162353`
- Accountable seat: May
- Reasoning runtime: local May (`ornith-1.0-35b`)
- Adapter: `scripts/model/ask-local.mjs`
- Status: non-authoritative planning options; not an implementation blueprint

## Packet-size evidence

Two packets near 2,000-2,700 input tokens returned quickly with usable challenges. Larger whole-module packets returned no usable message and were discarded. The working local-May packet size for this mission is therefore a compact verified evidence summary plus one decision surface.

## Slice A — permission-audit filesystem store

May agrees that the slice should add a dedicated production store and reuse confinement, lock, append, sync, exact readback, and recovery patterns from existing stores without redesigning `PermissionAuditRecord` or `PermissionAuditReceipt`.

Candidate path set for Fury review:

- `src/permission-audit-store.mts`;
- `tests/permission-audit-store.test.mjs`;
- package export, package-surface test, and `PUBLIC_API.md` only if the host adapter is public.

Rejected local recommendations:

- malformed or invalid ledger lines cannot be skipped;
- uncertain writes cannot be automatically retried;
- digests are not orderable sequence identifiers;
- the interface remains `ledgerId`, `read()`, and `appendIfAbsent(record)` with an exact validated receipt, not an invented event API;
- test and build commands must use existing package conventions.

Required semantics: validate before mutation, lock-scoped replay and append-if-absent decision, durable sync, exact post-write readback, idempotent exact-record handling only where the existing contract permits it, and `recovery_required` or equivalent fail-closed uncertainty.

## Slice B — May control-event filesystem store

Candidate path set for Fury review:

- `src/may-control-event-store.mts`;
- `tests/may-control-event-store.test.mjs`;
- a closed public declaration/export only if needed by the host composition boundary.

The persisted event must preserve the existing fields exactly: `mayControlEventSchemaVersion`, `authority`, `eventId`, `sessionId`, `code`, `counter`, `toolCallId`, and `evidenceRefs`. The acknowledgement remains exactly `{ eventId, appended: true }`.

Rejected local recommendations:

- do not rename or invent event fields;
- do not retry uncertain appends with a fresh event;
- do not skip malformed persisted entries;
- do not treat telemetry as permission, runtime binding, or human evidence.

Fury must freeze event-code validation, counter scope, exact-duplicate behavior, replay/readback query, and post-write uncertainty semantics.

## Slice C — schema-9 execution context and active May binding

May compared three routes:

1. extend the schema-9 profile-aware journal;
2. add a separate durable active-runtime-binding store;
3. derive binding from an existing attributed receipt.

May recommends route 2 because route 1 changes the authority journal and route 3 risks conflating post-decision attribution with pre-effect binding. That recommendation is not approved. A new store could itself become an unintended authority source, and the existing v6-v8 `RuntimeBinding` contract plus open runtime-profile work must be reconciled before any new type is introduced.

Fury must determine whether #171 may add a host-observed, non-authoritative binding-evidence store that is validated against separately authorized mission scope, or whether the authority-bearing runtime-binding contract belongs to another prerequisite. No path may synthesize schema-v2 authority or make packet/model assertions authoritative.

## Requested Fury decision

Return one of:

- approve a bounded runtime-binding provenance route and state the exact contract it reuses;
- split the authority-bearing runtime-binding source into a separate prerequisite while allowing slices A and B to proceed;
- revise the store slices if their proposed durability boundary conflicts with existing contracts.

May will produce the exact implementation blueprint only after this decision.
