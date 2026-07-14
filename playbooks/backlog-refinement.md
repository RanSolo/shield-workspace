# Backlog Refinement

Use this playbook after brainstorming or ticket-creation sessions when the team
needs to organize GitHub issues into a coherent roadmap without implementing the
work.

## Goal

- give every new issue a clear home
- identify duplicates, overlap, and missing dependencies
- recommend Epic placement and sequencing
- keep backlog cleanup separate from implementation
- prepare a refinement report that Phil Coulson can approve

## Rules

- This playbook does not implement work.
- This playbook does not modify GitHub issues by itself.
- Maria Hill owns the initial triage and organization pass.
- Nick Fury reviews sequencing, architecture risk, and roadmap order.
- Phil Coulson approves the proposed organization before any follow-up mutation
  mission is launched.
- Issues may remain intentionally standalone when no Epic fit is correct.
- Icebox recommendations should be explicit, not implied.

## Required output for each issue

- recommended Epic or standalone status
- parent/child relationship recommendation
- dependencies
- priority
- labels
- suggested owner seat
- estimated implementation complexity
- issue type:
  - Epic
  - Feature
  - Enhancement
  - Technical Debt
  - Research
  - Spike
  - Playbook
  - Documentation
  - Icebox

## Refinement flow

1. Gather the newly created issues that need triage.
2. Group related issues under existing Epics when a clear fit exists.
3. Flag duplicate, overlapping, or prematurely split issues.
4. Identify missing dependencies, prerequisite work, and risky sequencing.
5. Recommend labels, priority, and suggested owner seat for each issue.
6. Call out anything that should stay in the Icebox.
7. Produce a backlog refinement report without mutating GitHub.
8. Escalate the proposed organization to Phil Coulson for approval.

## Follow-up mission boundary

If Phil Coulson approves the report, a later mission may:

- move issues into Epics
- apply labels
- create dependency links
- close duplicates
- create missing parent Epics

That follow-up work should be handled as a separate mutation mission.
