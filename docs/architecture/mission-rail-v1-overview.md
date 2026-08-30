# Mission Rail V1 — human overview

## What we are building

One clean, maintainable path that carries a software issue from intake to a
draft pull request and returns its team lane to ready.

```text
intake -> plan -> Fury review -> Guided Plan Review -> human GO
       -> May implementation -> Mack validation -> Fury conformance
       -> Guided Code Review -> draft PR -> Guided QA PASS -> lane ready
```

The existing SHIELD implementation remains available while the new rail is
built beside it. We are not deleting the old system or forcing its broken paths
to govern their own replacement.

## How we build it

Factory is the primary construction host. Its Droids use the SHIELD seat model,
but they travel in Track-Layer Mode:

- Hill coordinates the Factory Mission and exceptions.
- Daisy surveys old code and issue history without writing.
- Fury reviews architecture, plans, and exact candidate revisions.
- May builds one bounded component at a time.
- Mack independently validates integrated milestones.

The crew uses ordinary Git branches, Nx targets, SonarQube, and draft PRs. It
does not call the old SHIELD mission CLI for permission to build the new rail.

Construction begins with **Epic Wheels Up**. One human GO accepts the bounded
architecture, issue graph, owned paths, milestones, budget, and effects through
draft PR publication. The team then cycles through those issues autonomously.
It does not ask for a fresh PIN merely because one issue ended and the next
dependency became ready.

SHIELD is a bullet-train control system, not a police force. Green signals move
work automatically. Yellow signals surface useful warnings without parking the
team. Known defects use switches that route correction and return to the main
line. Red signals are reserved for actual collision risks: meaningful human
authority, irreversible effects, contradictory identity/evidence, or missing
external capability.

## Package map

| Package | One responsibility |
| --- | --- |
| `@shield/canonical-contract` | Deterministic JSON, digests, IDs, and primitive validation. |
| `@shield/mission-rail` | Pure mission states and the one legal next action. |
| `@shield/guided-review` | One human review model for plans, exact code changes, and QA scenarios. |
| `@shield/mission-store` | Event codecs, sequence validation, snapshots, and replay—no I/O. |
| `@shield/lane-lifecycle` | Pure Alpha/Bravo/Charlie assignment, reconciliation, and retirement decisions. |
| `@shield/mission-projection` | Read-only status consumed by CLI and Mission Control; includes Guided Review aggregate facts. |
| `@shield/mission-host` | Git, filesystem, JSONL, GitHub, process, signer, and agent-host effects. |
| `@shield/team-system` | Thin CLI and compatibility shell while old commands migrate. |

Existing `@shield/mission-preparation` remains unchanged through the first
successful flight. We may extract proven neutral code from it, but we do not
make the legacy package depend on the replacement during construction.

## What should feel different

- Agents never hand-author authority or transition JSON.
- Guided Review presents plans, exact code changes, and QA scenarios in small
  sections so the human can understand and steer the work without decoding
  agent transcripts.
- Delivery Mode uses that review per issue. Track-Layer Mode uses it at epic GO
  and milestone/epic completion, unless the accepted architecture materially
  changes.
- `next` always returns one action, one meaningful human gate, one external
  blocker, one repair instruction, or completion.
- A gate explains the decision in ordinary language and supplies one copy-safe
  action.
- Draft PR creation is included in bounded implementation approval; merge,
  deployment, release, and destructive migration remain separate decisions.
- A mission cannot finish with commits stranded only in a lane.
- Alpha, Bravo, and Charlie keep stable paths and become reusable after every
  delivery.
- PR follow-ups happen outside the stable delivery lane.
- Mission Control displays canonical projections; it is not another workflow
  engine.

## Maintainability promise

Maintainability starts with the first generated package:

- every package has build, test, typecheck, lint, dependency-boundary, and
  SonarQube coverage;
- Nx tags enforce allowed dependency directions and reject cycles;
- functions and modules remain intentionally small;
- public APIs are narrow and versioned;
- repeated mechanical logic is promoted into one tested component;
- Daisy, Fury, May, and Mack each have an explicit boundary-detection duty;
- exceptions require a short architectural record, not a silent oversized file.

These checks are onboard sensors. They provide fast feedback during a feature
and become integration gates at milestones; they do not add ceremony after
every edit.

The initial quality stack is deliberately compact: strict TypeScript,
type-aware ESLint, Nx module boundaries, focused tests, dead-code/dependency
checks, and a SonarQube new-code gate. Property-based tests are added to pure
rail/replay contracts; mutation testing is reserved for those critical kernels
at milestone boundaries. We do not install overlapping dashboards merely to
look rigorous.

The repository itself is part of the product demonstration. A reviewer should
be able to understand the package graph, open a small module, run its focused Nx
targets, inspect its SonarQube result, and follow one real mission trace without
first learning the history of the old runtime.

## What we keep from the old system

- exact repository and artifact identity;
- explicit human authority for meaningful decisions;
- immutable, idempotent external-effect receipts;
- independent Mack and Fury evidence;
- safe failure on stale, malformed, conflicting, or ambiguous facts;
- useful pure functions and characterization tests.

## What we simplify or leave behind

- repeated schema-specific identity fields inside every operation;
- hand-composed transition packets;
- compatibility paths inside the new kernel;
- malicious same-user filesystem-race defenses;
- redundant publication PINs;
- temporary worktree paths as durable coordination state;
- calling a seat “done” before its work is delivered or archived.

## Construction and proof

Factory first plans the complete feature graph in Spec Mode. Human GO freezes
the architecture, manifest digest, milestone plan, and autonomy envelope. The
Factory Mission then runs autonomously through draft PRs, stopping only for a
material design/scope change, missing external capability, contradictory
evidence, or an unauthorized destructive/merge/deploy/release effect.

Each component is tested with disposable fixtures. The final proving flight
uses one curated real issue and must finish with a draft PR and a reusable lane.
That flight dogfoods Guided Plan Review before GO, Guided Code Review against
the exact implementation, and Guided QA against observable acceptance
scenarios. Automated tests prove contracts; Guided QA proves the operator can
use and understand the delivered behavior.

Guided QA must show the thing working. It launches the exact candidate in a
disposable proving environment, walks a visible operator scenario, compares
expected with observed behavior, and retains a concise transcript, screenshot,
or video reference. A checked box or passing unit test alone is not QA proof.

## Definition of success

A cold Hill can start an issue from repository context, understand the current
phase, follow one recommended action, reach only meaningful human decisions,
and complete the full delivery path without improvising internal contracts.
