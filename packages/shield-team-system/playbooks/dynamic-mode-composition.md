# Dynamic Mode Composition

Use this playbook when defining or reviewing how mission-time modes are
attached to SHIELD seats.

## Goal

- separate seat identity from mission expertise
- let Maria Hill compose the lightest useful mission package
- make per-seat mode attachments explicit in the mission record
- keep new mode additions from forcing agent-identity rewrites

## Core contract

- Agents define identity, responsibilities, authority, and boundaries.
- Modes define reusable expertise, tools, workflows, and mission context.
- Maria Hill assigns one or more modes to each participating seat at mission
  start.
- Only participating seats receive loaded modes for the current mission.
- Seats should not permanently carry domain context that belongs in a mode.
- New modes should be addable without rewriting existing seat definitions.

## Composition rules

1. Start from the mission goal, not from a preferred tool or framework.
2. Choose the participating seats first.
3. Attach only the modes each participating seat actually needs.
4. Reuse existing modes before inventing a new one.
5. Keep mode names domain-specific and reusable.
6. If a seat needs new expertise mid-mission, route that request through the
   agent-request flow instead of silently expanding context.

## Mission record requirements

Each mission plan or scorecard should record:

- which seats are participating
- which modes are attached to each participating seat
- why each attachment is needed when the reason is not obvious
- whether any extra mode was added mid-mission

## Example

Mission:

Implement a Next.js feature with Cypress coverage.

Recommended composition:

- Melinda May
  - Implementer Mode
  - Next.js Mode
  - Cypress Mode
- Daisy Johnson
  - Recon Mode
  - Cypress Investigation Mode
- Nick Fury
  - Architecture Review Mode

## Review questions

- Is identity separated cleanly from expertise?
- Are any seats carrying mode context they should not own by default?
- Are the attached modes the minimum needed for the participating seats?
- Could an existing mode be reused instead of inventing a new one?
