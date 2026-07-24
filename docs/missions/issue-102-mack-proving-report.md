# Durable Knowledge v0 — Mack proving report

## Closed validation scope

- Contract: `knowledge.entry.v0` and `knowledge.slice.v0`
- Validation owner: Mack
- Production implementation owner: May
- Repository and implementation head: exact branch revision under review
- Authority: non-authoritative evidence only

## Evidence

- Reviewed current entry with explicit human provenance: pass.
- Stale/expired entry: invalid with `ENTRY_STALE`.
- Superseded entry: invalid with `ENTRY_SUPERSEDED`.
- Untrusted source: invalid with `UNTRUSTED_SOURCE`.
- Unresolved conflict: invalid with `ENTRY_CONFLICT_UNRESOLVED`.
- Substituted entry revision or content digest: invalid with slice member/digest reason.
- Substituted approved slice manifest: invalid with `SLICE_BINDING_MISMATCH`.
- Helicarrier interpretation attempt: invalid with `SLICE_INTERPRETATION_ATTEMPT`.
- Focused knowledge tests: 5/5 pass.
- Full `@shield/team-system` tests: 288/288 pass.
- Build and package surface validation: pass.

The proving fixture is contract evidence; it does not claim automatic memory
ingestion, retrieval, ranking, or model interpretation.
