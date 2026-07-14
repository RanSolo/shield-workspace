# Begin Mission

Use this playbook at the start of every new mission before any implementation
work begins.

## Goal

Define a repeatable mission intake process that runs before any implementation
work.

## Rules

- Maria Hill owns mission intake and context gathering.
- Mission intake happens before implementation dispatch.
- The Mission Brief is the canonical intake artifact for every mission.
- Mission modes are selected after the brief is assembled, not before.
- Phil Coulson approves or rejects the Mission Brief before implementation is
  dispatched.
- Melinda May does not begin implementation until the brief is approved.

## Workflow

1. Understand the objective.
2. Gather context.
3. Produce the Mission Brief.
4. Select and attach mission modes.
5. Present the Mission Brief to Phil Coulson for approval.
6. Dispatch the mission only after approval.

## Context gathering checklist

- GitHub issue
- Related pull requests
- Relevant source files
- Existing tests
- Risks and dependencies

## Mission Brief contents

- Objective
- Constraints
- Success criteria
- Risks
- Recommended participants
- Suggested modes

## Dispatch boundary

Mission intake ends when Phil Coulson approves the Mission Brief. Only then may
Maria Hill dispatch specialist work.
