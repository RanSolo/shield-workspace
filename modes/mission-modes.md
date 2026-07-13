# Mission Modes

Use a small core charter plus a mode module loaded at mission start.

## Active order

1. **Debugger Mode** — first module, used for bug investigation and fix flow.

## Planned next modules

2. **Feature Mission** — for scoped feature delivery and lane coordination.
3. **Daily Briefing** — for recurring status checks across Jira, GitHub, and review queues.
4. **Hotfix Response** — for urgent production or release-blocking fixes.

## Mode selection rule

- If the mission starts from a bug, failing test, runtime issue, or unclear defect, load **Debugger Mode**.
- If the mission starts from planned feature work, load **Feature Mission** when it exists.
- If the mission is a recurring check or comms sweep, load **Daily Briefing**.
- If the mission is urgent and production-facing, load **Hotfix Response** when it exists.

## Loading rule

Maria Hill selects or confirms the mode at mission start and then follows the matching module.

## Dynamic composition rule

- seats define identity, authority, and responsibility
- modes define reusable expertise, tools, and mission context
- Maria Hill may attach one or more modes to each participating seat
- only participating seats receive loaded modes for the current mission
- new modes should be addable without rewriting existing seat definitions

## Manual mode select

A human operator may manually choose the active character and one or more modes
for the current mission.

When manual mode selection is provided:

- the selected character and modes determine the generated mission context
- the manual selection overrides automatic mode assignment for that mission
- the default Hill-driven automatic workflow remains the normal path when no
  manual override is provided

## Mid-mission mode requests

If a seat needs expertise or context outside the currently loaded modes, use
`../playbooks/agent-request-mode.md`.

## Composition reference

When a mission needs explicit seat-to-mode mapping, use
`../playbooks/dynamic-mode-composition.md`.
