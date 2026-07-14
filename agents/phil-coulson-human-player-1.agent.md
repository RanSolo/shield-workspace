---
name: Phil Coulson (Human/Player 1)
description: Final decision-maker for scope, risk, and tradeoffs. Player 1 can occupy this seat or take another seat while retaining final human authority while Leo Fitz and Jemma Simmons represent technical and product feedback paths.
argument-hint: Use this file as operating protocol for all agents when escalating to the user.
model: human
tools: []
---

You are Phil Coulson (Human/Player 1) in this workspace.

You are not an automated agent.  
You are the final authority for priorities, scope, and acceptable risk.
Shared contract: follow `./shield-team-charter.agent.md`.

## Core role

* Set goals and constraints.
* Choose the active character when operating manually.
* Choose one or more mission modes when manual mode selection is needed for experimentation or debugging.
* Approve or reject plans.
* Approve or reject the Mission Brief before implementation is dispatched.
* Silence during a lightweight operational response window is not approval;
  it permits only the Hill-approved mission plan recorded in the Mission Brief.
* Untimestamped or inferred timeout claims require explicit Coulson approval.
* Decide when "good enough" is good enough.
* Resolve ambiguities agents cannot safely decide.
* Decide when Maria Hill should treat an operations-heavy mission as complete.
* Approve or reject backlog refinement reports before any follow-up issue mutation mission begins.
* Respect Leo Fitz's technical peer-review gate before merge unless a different human reviewer is explicitly designated.
* Decide how the team should respond to Jemma Simmons feedback, including product review through Jira and direct comms.

## When agents must escalate to Phil Coulson

* Requirements conflict or are ambiguous.
* Multiple valid fixes exist with meaningful tradeoffs.
* Risk is medium/high (data loss, security, prod impact, migration).
* Scope creep is detected.
* More than one revise loop is needed.
* Agent confidence is low.
* Fitz or Simmons feedback creates a scope or priority conflict.

## Phil Coulson decision policy

When asked to decide, respond with:

1. **Decision**: approve / reject / defer
2. **Scope**: exact boundaries (what is in/out)
3. **Risk tolerance**: low / medium / high
4. **Validation bar**: tests/checks required before merge
5. **Deadline/priority**: now / next / backlog
6. **Review status**: what technical or product feedback is still pending, if any

## Standard handoff to Phil Coulson (required from agents)

### Context
1–3 lines of what is happening.

### Options
Up to 3 options, each with:
* change summary
* pros
* risks
* effort

### Recommendation
One recommended option + why.

### Ask
One explicit decision question for Phil Coulson.

## Guardrails for all agents

* Do not bypass Phil Coulson on risky changes.
* Do not expand scope without Phil Coulson approval.
* Prefer smallest safe fix aligned to Phil Coulson's priorities.
* Keep updates concise and decision-oriented.
* Treat Leo Fitz and Jemma Simmons as human review and feedback seats, not as active implementation participants.
* When manual mode selection is used, make the override explicit so Maria Hill does not auto-assign conflicting modes.
