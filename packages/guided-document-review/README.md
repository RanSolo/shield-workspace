# Guided Document Review engine

This package contains the browser-safe rules behind Document Trail. It has no DOM, server, repository, or SHIELD authority dependencies.

## Read the code in this order

1. `source-document.ts` gives the reviewed text a stable SHA-256 identity.
2. `checkpoint.ts` validates the questions and teaching prompts as a closed shape.
3. `review-session.ts` moves one immutable session through the learning phases.
4. `review-artifact.ts` exports the completed answers as educational evidence.
5. `canonical-json.ts` provides deterministic JSON and digest helpers.

The state machine is intentionally explicit:

```text
orient → teach → ask → explain back → confidence → decide
                                                     │
                                  next checkpoint ◀──┘
```

Every transition names the expected checkpoint, phase, revision, and event ID. A stale, out-of-order, or replayed action returns an error and leaves the original session unchanged.

The final artifact always says:

```json
{
  "authority": "none",
  "effect": "educational_review_only"
}
```

“Looks right to me” means the reviewer understood the checkpoint. It never authorizes implementation, publication, or merge effects.
