# Issue #70 — Training Wheels Off

## Mission

Remove the separate post-Fury-plan Coulson approval expectation for routine
Delivery Mode implementation dispatch while preserving every material authority
gate.

## Scope

- Preserve Coulson Mission Brief approval as the mission authority source.
- Preserve early draft Mission Workspace creation after Mission Brief approval.
- Add a bounded Training Wheels Off evidence path to `canDispatchSpecialists`.
- Document that Hill may dispatch May after Fury approves an in-scope plan at
  the exact current revision without a second Coulson plan-dispatch approval.
- Keep material scope, risk, authority, destructive/external, unresolved
  tradeoff, and final human gates routed to Coulson.

## Boundaries

- Training Wheels Off does not remove Fury review, validation, Fitz review, or
  final Coulson gates.
- Training Wheels Off does not grant tool permission, runtime substitution,
  merge, deploy, release, or external communication authority.
- Missing, stale, ambiguous, substituted, or material-gate evidence fails closed
  when the explicit Training Wheels Off path is used.

## Validation

- Mission policy tests cover the preserved explicit/mission-approved path, the
  bounded Training Wheels Off path, and fail-closed material gates.
- Begin-mission intake tests cover the updated dispatch-boundary language.
