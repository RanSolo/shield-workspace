# Daisy Reconnaissance — Issue #102

## Gate

Evidence-only reconnaissance completed. No contract or implementation files were edited.

## Baked-in framework behavior

- Mission Journal and Mission Record use closed schemas, append-only sequence checks, deterministic replay, and explicit state transitions.
- Runtime bindings use explicit revisioned supersession and stale/ambiguous rejection.
- Host attestations are time-bounded observations, not authority grants.
- Helicarrier v0 verifies digest bundles and emits immutable receipt-bound output without interpreting content.
- Handoff rendering and Hill readiness preserve seat attribution and non-authoritative evidence boundaries.

## Session-provided behavior

- Context carried in handoffs and mission conversations.
- Manual Hill selection of relevant context for a new mission.
- Model/session identity currently recorded as workflow telemetry rather than durable knowledge provenance.

## Temporary workarounds

- PR bodies and handoff comments as durable-looking continuity surfaces.
- Mission Journal as the nearest append-only record even though it is intentionally governance/execution authoritative.

## Framework gaps

- No closed durable knowledge-entry schema.
- No entry-level provenance, freshness, supersession, contradiction, or trust state.
- No deterministic slice contract binding exact entry revisions and digests.
- No technical barrier preventing notebook knowledge from being mistaken for governance evidence.
- No defined handoff-to-durable-knowledge promotion gate.
- No mechanical poisoning detector; untrusted-source status must be explicit rather than inferred.

## Important uncertainty

The permission implementation references journal schema v6 while the inspected journal contract is v1. This must not be “fixed” inside #102. It is a separate compatibility question and is outside the notebook child scope.

Whether notebook entries belong in a separate non-authoritative append-only store or a distinct namespace remains an architecture decision for Fury. Extending the Mission Journal directly would risk violating the authority boundary.
