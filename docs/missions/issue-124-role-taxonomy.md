# Issue #124 — Canonical Mission Role Taxonomy

## Decision

The role taxonomy is additive and versioned. Existing `seatId` fields remain
persisted compatibility names; they are not renamed or removed. The canonical
v1 registry defines the human authority roles `coulson`, `fitz`, and `simmons`.

Each role uses a surface-specific verified identity. Local private keys are not
required by this contract, but evidence must remain host-verified or
cryptographically verified and bound to the exact mission revision.

Issue #124 owns the durable role-registry and gate-capability model. It must not
make Fitz or Simmons mandatory for every mission.

