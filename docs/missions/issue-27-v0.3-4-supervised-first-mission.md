# Approved Mission Brief: V0.3-4 Supervised First Mission

- **Canonical issue:** `RanSolo/shield-workspace#27`
- **Mission state:** approved with Wheels Up
- **Authority:** Phil Coulson decision recorded 2026-07-18
- **Dependencies:** Issues #23 and #26 complete

## Objective

Deliver one durable local supervised mission that exposes governance,
execution, readiness, and communication separately without implementing a
runner or host adapter.

## Approved scope

- Add journal v2 while preserving deterministic journal v1 replay.
- Add content-addressed Ed25519 trusted bindings and signed evidence records.
- Bind evidence to the mission, requirement, human seat, subject, exact
  revision, decision, timestamp provenance, key reference, and journal sequence.
- Add `mission begin`, `approve`, `status`, `step`, `pause`, `resume`, `cancel`,
  `report`, and `evidence record`.
- Prove execution may complete while acceptance readiness waits for Fitz or
  explicitly required Simmons evidence.

## Boundaries

`mission step` records one deterministic journal transition only. It performs no
model invocation, seat dispatch, tool or executor call, network access, host
adapter behavior, or external effect. Issues #8, #10, and #28 remain separate.
Merge, deployment, release, and scope expansion are not authorized.

## Review gate

Wheels Up includes bounded draft-PR publication. Fury must approve the exact PR
head before Hill marks it ready for Fitz. Any later commit invalidates Fury's
approval.
