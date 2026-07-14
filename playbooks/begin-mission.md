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
- Specialist dispatch and all non-lightweight work require Phil Coulson's
  explicit approval. An eligible lightweight operational mission may instead
  activate only through the verified-timeout path documented below.
- Melinda May does not begin implementation until the brief is approved.

## Workflow

1. Understand the objective.
2. Gather context.
3. Produce the Mission Brief.
4. Recommend mission modes and proposed seat attachments.
5. Present the Mission Brief to Phil Coulson for approval.
6. After approval, activate and attach the approved modes, then dispatch the
   mission.

## Lightweight operational path

Low-risk, reversible operational missions may use a shorter intake path when
they do not change production code, architecture, data, security, product
behavior, or external commitments.

For this path, the Mission Brief may be a compact inline record containing only
the objective, scope boundary, validation, Hill-approved mission plan, response
window, and activation status.

This repository does not currently include a scheduler or persistent runner. A
fully automatic runner is a future capability. Timeout activation is available
only when the active host supplies trustworthy waiting and resumption evidence,
or when a human operator records the window's opening and evaluation times in
ISO 8601 format. Hill must not infer or merely claim that the window elapsed.
Without that evidence, explicit Coulson approval remains required.

1. Maria Hill records the objective, boundaries, validation, Hill-approved
   mission plan, Coulson response window, opening time, and timing evidence
   source in the Mission Brief.
2. Hill presents the brief to Coulson. A supporting host may wait and resume the
   mission, or a human operator may observe the recorded response window.
3. If Coulson intervenes, Hill follows the decision.
4. If the evidence proves the window expired without a response, Hill may
   activate and execute only the recorded Hill-approved mission plan.
5. Hill records that her approved mission plan was activated by timeout. The
   timeout does not count as Coulson approval.

The default response window is five minutes unless the repository or human
operator specifies another value. Implementation, architecture, security,
data, production, destructive, or externally consequential missions always
require explicit Coulson approval and cannot use this path.

## Recommended versus activated modes

- Recommended modes are proposals included in the Mission Brief with a reason.
- Activated modes are the modes actually attached to a seat for the mission.
- The Mission Brief records who or what activated each mode: Coulson approval,
  a manual operator override, or a verified lightweight operational timeout.
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

Mission intake ends when the Mission Brief is explicitly approved, or when an
eligible lightweight operational plan is activated through a verified timeout.
Maria Hill may dispatch specialist work only after explicit Coulson approval. A
verified timeout authorizes Hill to execute only the recorded lightweight plan;
it does not authorize specialist dispatch.
