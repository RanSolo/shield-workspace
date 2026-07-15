# Manual Mode Select

Use this playbook when a human operator wants to act as a specific character and
manually choose which modes should be loaded for the current mission.

## Goal

- allow a human to choose the active character
- allow manual selection of one or more modes
- build mission context from the selected modes
- preserve the same execution pipeline used by automatic orchestration
- make it easy to compare manual selection with the default Hill-driven flow

## Rules

- Manual mode selection is optional.
- Manual mode selection overrides automatic mode assignment for the current
  mission only.
- The selected character and modes determine the generated mission context.
- The default Hill-driven workflow remains unchanged when no manual override is
  provided.
- Manual mode selection does not change approval rules, quality gates, or seat
  boundaries.

## Manual selection record

### Active character

Which seat the human is actively playing for this mission.

### Selected modes

The exact modes loaded for the mission.

### Reason

Why manual selection is being used instead of the default automatic routing.

### Override scope

Confirm that the override applies only to the current mission unless explicitly
promoted later.

## Example

Playing as Maria Hill:

- Orchestrator
- Nx
- Cypress
- GitHub

The resulting mission context is generated from those selected modes instead of
the default automatic assignment.
