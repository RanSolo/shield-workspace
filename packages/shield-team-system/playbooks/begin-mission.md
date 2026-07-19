# Begin Mission

Use this playbook at the start of every new mission before any implementation
work begins.

## Goal

Define a repeatable mission intake process that runs before any implementation
work.

## Rules

- Maria Hill owns mission intake and context gathering.
- `../contracts/mission-policy.mjs` is the executable, fail-closed authority for
  mission decisions, risk classification, timeout activation, specialist
  dispatch, and repair authorization.
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
6. After approval, activate and attach the approved modes.
7. For Delivery Mode, create or update the draft PR Mission Workspace before
   specialist implementation dispatch.
8. Dispatch the approved mission.

## PR Mission Workspace

Delivery Mode uses a draft pull request as the visible team communication
surface from the start of implementation. After Coulson's explicit approval,
Hill validates the exact input with
`../contracts/workspace-contract.mjs:validateMissionWorkspaceInput`, generates
the body with a caller-supplied ISO 8601 UTC timestamp, and calls
`../github/delivery-workspace.mjs:prepareDeliveryWorkspaceForDispatch`. That
orchestration guard delegates publication mechanics to
`../github/pr-workspace.mjs:createOrUpdatePR`; it does not duplicate them.

The adapter requires the approved Mission Brief to be tracked, clean, and
committed on the expected mission branch. It creates a draft PR when none
exists, updates exactly one matching open draft, and blocks on lookup failures,
ambiguous matches, or a non-draft match. Hill may report a PR URL only after a
successful GitHub readback. A blocked workspace suspends specialist
implementation dispatch; it never authorizes Hill to fabricate progress or use
the lightweight timeout path.

Successful readback returns a closed receipt containing the repository, base
branch, mission branch, exact artifact revision, pull-request number and URL,
open state, and draft state. Hill may dispatch a Delivery Mode specialist only
when the guard returns `dispatch_ready` with a receipt matching every expected
field. Missing, stale, ambiguous, malformed, or mismatched receipts fail
closed. Repeated publication must update and reverify the one existing open
draft PR.

After the workspace is verified, Hill publishes major human-facing handoffs as
the mission progresses. Attribution is derived from the participating seat;
models, runtimes, adapters, and tool executors are never relabeled as seats.
Routine internal events stay out of GitHub, and final PR-body summaries do not
replace the historical handoff comments.

## Mission decisions and risk

Coulson decisions use the explicit `approve`, `edit`, `reject`, `pause`,
`resume`, and `cancel` transitions in the executable policy. Rejected and
cancelled missions are terminal. Hill must not infer or invent a transition when
the policy returns `null`. A paused mission must record the valid resume state
(`proposed` or `approved`) in the Mission Brief before Hill may resume it.

Every Mission Brief records boolean values for the `production`, `destructive`,
`migration`, `credentialsOrSecurity`, `externalCommunication`, `merge`,
`deploy`, `release`, and `hillHighRisk` flags. Any true flag requires explicit
Coulson approval. Missing, unknown, or non-boolean risk data fails closed as
high risk and cannot use timeout activation.

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

Before timeout activation, Hill must use `evaluateLightweightTimeout` with the
full boolean risk-flag set and the exact `operations` mission mode. Before
specialist dispatch, Hill must use `canDispatchSpecialists`. A denied result
cannot be overridden by Hill or by silence.

## Repair policy

- One repair is allowed automatically.
- Later repairs require explicit Coulson authorization.
- Every mission records a positive-integer repair hard cap.
- A missing or invalid hard cap fails closed to `1`.
- The hard cap is absolute and cannot be exceeded, even with authorization.

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
