# Mission Brief — Issue #102 Durable Knowledge Entries and Validated Notebook Slices

## Objective

Define the smallest durable knowledge contract under #87: one immutable knowledge entry and one deterministic, reviewable notebook slice that a trusted Helicarrier can validate and consume without interpreting or rewriting content.

## Entry boundary

Each entry must identify its kind (`observation`, `inference`, `decision`, `rejection`, or `unresolved_question`), authoring seat, provenance, creation time, freshness expectation, revision, supersession state, trust status, and content digest.

## Slice boundary

A slice must bind one mission or seat scope to exact entry revisions, deterministic ordering, content digests, curator proposal metadata, and validation status. Conflicting or superseded entries remain visible and cannot be silently replaced.

## Authority boundary

Notebook knowledge is non-authoritative. The Mission Journal remains authoritative for governance and execution. Hill proposes and selects; selection does not create truth or authority. The Helicarrier validates and consumes a slice mechanically without ranking, summarizing, inferring, or expanding it.

## Explicit exclusions

No Stage B replay, model retrieval, embeddings, vector database, automatic summarization, Mission Control UI, broad notebook implementation, persistent model memory, automatic routing, Mission Journal changes, or authority changes.

## Required gates

Daisy evidence-only reconnaissance → Hill bounded contract and threat model → Fury architecture/conformance approval → separate Coulson implementation authorization → May implementation.

## Stop conditions

Stop and return to Coulson if the contract requires governance-state changes, model interpretation, automatic routing, persistent sessions, new authority semantics, Stage B behavior, or changes to the Helicarrier v0 kernel.
