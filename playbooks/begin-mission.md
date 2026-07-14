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
- Recommended modes are proposals. They are not active until the Mission Brief
  records their activation.
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

## Lightweight operational path

Low-risk, reversible operational missions may use a shorter intake path when
they do not change production code, architecture, data, security, product
behavior, or external commitments.

For this path, the Mission Brief may be a compact inline record containing only
the objective, scope boundary, validation, recommended default plan, response
window, and activation status.

1. Maria Hill records the objective, boundaries, validation, recommended
   default plan, and Coulson response window in the Mission Brief.
2. Hill presents the brief to Coulson and waits for the recorded response
   window.
3. If Coulson intervenes, Hill follows the decision.
4. If the window expires without a response, Hill may activate and execute only
   the recorded default operational plan.
5. Hill records that the default plan was activated by timeout. The timeout
   does not count as Coulson approval.

The default response window is five minutes unless the repository or human
operator specifies another value. Implementation, architecture, security,
data, production, destructive, or externally consequential missions always
require explicit Coulson approval and cannot use this path.

## Recommended versus activated modes

- Recommended modes are proposals included in the Mission Brief with a reason.
- Activated modes are the modes actually attached to a seat for the mission.
- The Mission Brief records who or what activated each mode: Coulson approval,
  a manual operator override, or the lightweight operational timeout.
- Hill must not describe a recommended mode as active before that record exists.

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
- Activation status and response window

## Dispatch boundary

Mission intake ends when Phil Coulson approves the Mission Brief. Only then may
Maria Hill dispatch specialist work.
