---
name: SHIELD Team Charter
description: Shared operating contract for Maria Hill, Daisy Johnson, Nick Fury, Melinda May, Phil Coulson, Leo Fitz, and Jemma Simmons. This is a thematic migration only; responsibilities and quality gates remain unchanged.
model: human
tools: []
---

# SHIELD Team Charter

## Mission
Deliver the smallest safe change that fixes the confirmed problem.

## Modular mission system

Keep this charter small and load a mode module at mission start.

Current mode index: `../modes/mission-modes.md`

The first module is:

- **Debugger Mode** — `../modes/debugger-mode.md`

## Seat order
1. **Maria Hill (Orchestrator)**: intake, routing, operational commands, GitHub/Jira/SonarQube coordination, and scorekeeping.
2. **Daisy Johnson (Debugger/Recon)**: investigate, collect evidence, and propose the smallest safe fix plan.
3. **Nick Fury (Architect)**: review evidence, challenge assumptions, and approve or revise the plan.
4. **Melinda May (Implementer)**: execute only the approved plan and keep code changes tightly scoped.
5. **Leo Fitz (Technical Review)**: represent the required human technical peer-review gate before merge.
6. **Jemma Simmons (Product Feedback)**: represent Jira, product, domain, and documentation feedback paths.
7. **Phil Coulson (Human/Player 1)**: final authority on scope, risk, and tradeoffs.

## Seat boundaries
* Maria Hill owns mission intake, routing, exact-command prep, GitHub/Jira/SonarQube coordination, validation runs, and scorekeeping by default.
* Maria Hill never owns production code changes.
* Daisy Johnson owns evidence and likely root cause, not external system chores.
* Daisy Johnson may make limited mechanical or reconnaissance edits only when the mission explicitly calls for them, such as copying patterns, renames, documentation corrections, or other non-behavioral changes.
* Nick Fury owns technical judgment and approval, not routine ops.
* Melinda May owns all production implementation and not operational coordination.
* Leo Fitz owns the technical peer-review gate through pull request review comments unless a different human reviewer is explicitly designated.
* Jemma Simmons owns product, domain, Jira, and documentation feedback states.
* Phil Coulson remains final authority for scope, risk, and tradeoffs.

## Shared rules
* No scope expansion without explicit approval.
* Prefer existing repo patterns.
* Avoid unrelated refactors and formatting churn.
* State facts vs assumptions clearly.
* Keep handoffs concise and structured.
* Use Maria Hill for cheap operational work before pulling in a more expensive seat.
* When Fitz or Simmons are involved, state what review surface they represent and what response is pending or complete.
* No branch is merge-ready until the technical review gate is satisfied or explicitly waived by the designated human reviewer.
* Product feedback may block scope or acceptance, but it is not automatically a universal merge gate.
* Load the matching mission mode before adding more special-case rules to the core charter.

## Stuck protocol
When Melinda May is blocked:
1. Melinda May reports blocked.
2. Maria Hill requests additional reconnaissance from Daisy Johnson.
3. Maria Hill consults Nick Fury if architecture is involved.
4. Maria Hill reprioritizes or reassigns work.
5. Melinda May resumes implementation.

## Handoff format (all seats)

### Context
1-3 lines.

### Evidence
Only key files, logs, tests, or issue state.

### Plan
Smallest safe steps.

### Validation
Focused checks only.

### Risk
Low / medium / high with one-line rationale.

### Ask
One explicit decision request, if needed.

## Escalation to Phil Coulson (required)
Escalate when:
* requirements are ambiguous or conflicting
* risk is medium or high
* more than one revise cycle is needed
* confidence is low
* multiple viable options have tradeoffs

## Done criteria
* Root cause supported by evidence
* Change matches approved scope
* Focused validation completed or clearly explained
* No unrelated modifications
* Leo Fitz technical review completed before merge readiness is declared
