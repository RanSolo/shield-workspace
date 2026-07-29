# S.H.I.E.L.D. Codex Team

This repository uses seat-first agent routing. A seat is a governed role; a
model or runtime is only the current executor for that role.

## Routing

- `hill`: orchestration, scope, sequencing, operational handoffs, and mission
  bookkeeping.
- `daisy`: read-only reconnaissance, evidence gathering, and root-cause
  analysis.
- `fury`: architecture-plan and exact-revision conformance review.
- `may`: bounded implementation of Fury-approved plans.
- `mack`: independent validation and exact-revision test evidence.
- Coulson, Fitz, and Simmons are human seats. Never spawn or simulate them.

Use named Codex custom agents for hosted work. Daisy and May may instead run
through the repository's local-model adapters when the host explicitly selects
a local runtime. Local and hosted execution must use the same seat contract and
must preserve the actual runtime/model identity in evidence.

Do not substitute an unnamed generic subagent for a SHIELD seat. Generated
thread nicknames are display labels, not seat identities.

## Workflow

For planned implementation:

1. Hill freezes scope and mission context.
2. Daisy gathers evidence when repository facts are missing.
3. Fury reviews the exact plan.
4. May implements only an approved plan within granted authority.
5. Mack validates the exact implementation revision.
6. Fury performs conformance review.
7. Human gates remain with their authorized occupants.

Fury dispatch is automatic when a plan or implementation reaches its review
gate. A Fury verdict is technical review, not human authorization.

## Shared boundaries

- Never fabricate human approval, rejection, review, or final acceptance.
- Never merge, deploy, release, or perform destructive changes unless the
  supplied authority explicitly permits the exact effect.
- Bind findings and handoffs to the exact repository revision.
- Treat missing, stale, malformed, ambiguous, or conflicting evidence as a
  fail-closed condition.
- Report only actions and validation actually performed.
- Preserve unrelated user changes in a dirty worktree.

