# Hill Plan — Canonical Mission Runtime Entry Point

## Ownership

- Hill owns the runtime map, mission route, handoffs, and stop conditions.
- Daisy owns read-only evidence gathering.
- Fury owns architecture and conformance review.
- May owns implementation after authorization.
- Mack owns independent validation.
- Coulson and Fitz remain human gates.

## Phase 1 — Runtime responsibility audit

Create an evidence-backed map for:

1. mission creation and durable loading;
2. replay and current-state projection;
3. next-action and next-seat derivation;
4. mode and runtime-context resolution;
5. Helicarrier dispatch preparation;
6. runner authorization, execution, and result validation;
7. bounded May or Daisy execution;
8. authoritative result construction and journal append;
9. adapter effects and receipts;
10. human-gate and terminal stopping behavior.

For each seam, record its public specifier, authority, caller-owned inputs,
result type, persistence behavior, and known non-goals.

## Phase 2 — Composition decision

Answer whether a supported top-level function already composes the map.

If none exists, propose one thin single-cycle function. Prefer composition by
runtime stage and capability boundary. Keep seat identity in the data and
receipts rather than creating one infrastructure stack per character.

The proposal must define:

- closed input and output shapes;
- injected host dependencies;
- exact replay/readback points;
- one-cycle and at-most-once behavior;
- stale-state and uncertain-effect handling;
- Hill-ready next-route context;
- human-gate stop results;
- compatibility and public-export position.

## Phase 3 — Fury plan gate

Before implementation, Fury reviews the exact committed brief, audit, and
composition proposal for:

- duplicated or bypassed authority;
- hidden scheduler or policy semantics;
- stale replay and at-most-once failures;
- seat/runtime/executor identity conflation;
- simulated human gates;
- unsafe adapter or journal ordering;
- compatibility and public API risk.

Any required correction returns to Hill. May is not dispatched until the exact
plan is approved.

## Phase 4 — Smallest implementation

If authorized, May implements only the approved single-cycle seam and its
public documentation. Existing runner, Helicarrier, permission, tool, adapter,
and supervision contracts remain authoritative.

No broad file reorganization is part of the initial slice. Extraction or
renaming requires evidence that the thin seam cannot be implemented cleanly.

## Phase 5 — Independent validation

Mack verifies:

- journal load and replay;
- ready, waiting, blocked, uncertain, completed, and human-gate outcomes;
- stale sequence and revision rejection;
- at-most-one dispatch and at-most-one durable append;
- no dispatch when authority or runtime binding is missing;
- exact candidate-to-entry binding;
- restart/readback behavior;
- no simulated human evidence;
- packed public API compatibility.

## Proving mission

After the runtime slice passes review, use a separately authorized, narrowed
slice of Issue #76:

> Generate a `minimal` starter pipeline profile for this repository, record
> real discovered commands and unavailable lanes, validate it, and stop at the
> next human gate.

The proof must identify which actions were framework-enforced, prompt-directed,
human-directed, temporary workarounds, or framework defects.

## Current route

Mission Brief approval → Delivery Mode activation → commit brief and audit
artifact → draft Mission Workspace → Fury plan gate → bounded May
implementation → Mack validation → Fury conformance → Fitz human gate.
