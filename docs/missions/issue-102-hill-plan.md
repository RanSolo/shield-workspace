# Hill Plan — Issue #102 Durable Knowledge Contract

## Ownership

- Hill proposes and selects a bounded slice; selection never creates truth or authority.
- Daisy supplies evidence only.
- Fury decides the storage/authority boundary and threat model.
- May implements only after separate Coulson authorization.
- Helicarrier validates exact structure, revisions, digests, and freshness mechanically; it does not interpret content.

## Contract shape to review

### Entry

An immutable entry should bind an entry ID, revision, kind, authoring seat, source provenance, runtime/executor attribution when applicable, content digest, creation time, freshness expectation, supersession state, conflict/trust status, and non-authoritative marker.

### Slice

A slice should bind mission/seat scope, curator proposal metadata, deterministic entry ordering, exact entry IDs and revisions, each content digest, validation status, and a slice digest.

### Fail-closed rules

Reject malformed, duplicate, stale, superseded-without-disposition, conflicting, substituted, provenance-incomplete, unauthorized, or digest-mismatched entries/slices. Preserve rejected and superseded history visibly.

## Architecture decision required

Do not extend the authoritative Mission Journal until Fury explicitly determines that a separate non-authoritative knowledge namespace can preserve replay and authority semantics. The safer default is a separate knowledge ledger consumed through a validated slice envelope.

## Stop conditions

No storage, retrieval, model provenance service, automatic routing, summarization, UI, Mission Journal migration, Helicarrier code change, or Stage B work begins in this mission.
