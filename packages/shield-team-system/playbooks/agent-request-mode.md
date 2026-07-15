# Agent Request Mode

Use this playbook when a seat discovers that the current mission requires
expertise or context that is not included in the currently loaded modes.

## Rules

- Agents do not silently attach modes to themselves.
- The requesting seat must explain why the mode is needed.
- Maria Hill may approve or reject the request.
- A human operator may approve, reject, or override the request.
- Approved modes are added only for the current mission unless explicitly
  promoted to a permanent workflow rule.
- The mission record should capture:
  - requested mode
  - requesting agent
  - reason
  - approver
  - outcome

## Request format

### Requesting agent

Which seat needs the additional mode.

### Requested mode

The exact mode being requested.

### Reason

Why the current mission cannot proceed cleanly without it.

### Scope

Whether the requested mode is needed for a single step, the remainder of the
mission, or a future reusable workflow.

### Approval

Approved / Rejected / Escalated / Overridden.

### Outcome

What changed for the current mission.

## Example

Melinda May is assigned:

- Implementer Mode
- React Mode

During implementation, she discovers that the feature requires end-to-end
coverage.

Melinda May requests:

- Cypress Mode

Maria Hill approves the request, and Cypress context is added to May for the
remainder of the mission.
