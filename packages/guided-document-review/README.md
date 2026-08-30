# Guided Document Review engine

This package contains the browser-safe rules behind Document Trail. It has no DOM, server, repository, or SHIELD authority dependencies.

## Read the code in this order

1. `source-document.ts` gives the reviewed text a stable SHA-256 identity.
2. `checkpoint.ts` validates the V2 checkpoints, 1–3 learning steps, and exact unique source quotes as a closed shape.
3. `review-session.ts` moves one immutable session through one-step-at-a-time learning and the final explain-back phases.
4. `replacements.ts` applies confirmed, non-overlapping source replacements deterministically.
5. `review-artifact.ts` exports V2 source/revised digests and structured replacements as educational evidence.
6. `canonical-json.ts` provides deterministic JSON and digest helpers.

The state machine is intentionally explicit:

```text
orient → learn step 1 → learn step 2 → explain back → confidence → decide
                                                                  │
                                               next checkpoint ◀──┘
```

Every transition names the expected checkpoint, phase, revision, and event ID. A stale, out-of-order, or replayed action returns an error and leaves the original session unchanged.

Choosing `revise` requires a structured replacement tied to a learning step. The original source quote is captured by the engine, while desired replacement text and optional rationale remain attached in the V2 artifact.

The final artifact always says:

```json
{
  "authority": "none",
  "effect": "educational_review_only"
}
```

“Looks right to me” means the reviewer understood the checkpoint. It never authorizes implementation, publication, or merge effects.
