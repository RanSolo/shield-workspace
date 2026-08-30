# SHIELD inside Factory

## The division of labor

**Factory supplies the machinery; SHIELD supplies the operating model.**
Factory provides Missions, Droids, repository tools, parallel execution, and
persistent host context. SHIELD provides repository-owned seat contracts,
effect envelopes, exact-revision evidence, review gates, and delivery
semantics.

Host-specific settings are advisory while SHIELD contracts are normative. The
same product meaning should survive when Factory, Codex, Copilot, or a local
model executes the work, even though each host has different capabilities and
adapters.

## What installation in a work repository means

SHIELD arrives as ordinary repository content in layers:

1. **Seat instructions.** `AGENTS.md` defines Hill, Daisy, Fury, May, Mack, and
   the human seats.
2. **Host adapters.** `.factory/` project Droids let Factory sessions occupy
   the specialist seats without changing the seat contracts.
3. **Machine contracts.** The accepted manifest and packet verifier bind scope,
   paths, effects, exact bases, validation, and handoffs.
4. **Rail packages.** The `@shield/*` libraries calculate the next operation,
   preserve deterministic history, project readable state, and execute effects
   through a thin host adapter.

The installation is therefore closer to Git than to one AI chat: the operating
model lives with the repository, while whichever supported host is available
acts through it.

## Where the parent Factory chat fits

The persistent parent Factory chat occupies the **Hill seat**. The seat is the
governed responsibility; Factory and its selected model are the current
executor. Evidence records both separately, so another supported runtime can
occupy Hill later without changing what Hill means.

Hill owns issue scope, the manifest feature graph, sequencing, assignments,
exception routing, and cross-feature state. Hill does not implement, review its
own plan, validate its own work, or simulate a human decision.

## The specialist team and the human boundary

Hill dispatches fresh-context specialist Droids with bounded packets:

- **Daisy** gathers missing repository and issue evidence without mutation.
- **Fury** reviews exact plans and implementation conformance without writing
  implementation code.
- **May** implements inside the packet's owned paths.
- **Mack** independently validates the exact candidate with the smallest
  sufficient Nx graph.

Coulson, Fitz, and Simmons remain human seats and are never spawned or
simulated. The system prepares meaningful decisions for the human; it does not
turn ordinary mechanical progress into repeated approval ceremony.

## A Track-Layer construction day

1. Hill selects the next accepted manifest feature. The verifier materializes
   its packet with exact base, dependencies, owned paths, allowed effects,
   validation, and handoff.
2. The selected host renders a bounded plan and Fury reviews the exact plan.
3. Epic Wheels Up records one human GO for the accepted construction graph and
   envelope. Accepted features and bounded corrections then advance without a
   new per-issue GO.
4. May implements; Mack validates the exact candidate; Fury checks
   conformance; the host creates a draft review publication when authorized.
5. Guided Code Review and visible Guided QA let the human understand and steer
   the exact delivered candidate. Merge, deployment, release, and destructive
   effects remain separate human decisions.

Epic Wheels Up is the Track-Layer construction pattern. Ordinary product
delivery uses the lighter per-issue rail and does not silently inherit a
construction program's authority.

## What is real now and what MR-000 builds

Today, the architecture, manifest, repository seat instructions, and legacy
SHIELD implementation are real. The new `.factory/` seat adapters, packet
verifier, quality targets, and Mission Rail packages are construction outputs,
beginning with MR-000.

Before those outputs land, Factory can follow SHIELD as repository
instructions, but that is contract-by-instruction rather than machine-enforced
Mission Rail execution. The rebuild moves enforcement from agent memory into
small, testable software contracts.

