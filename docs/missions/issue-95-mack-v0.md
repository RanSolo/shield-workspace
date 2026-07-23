# Mission Brief — Issue #95 Mack v0

## Objective

Define Mack as S.H.I.E.L.D.’s accountable validation specialist and design one bounded proving mission for independent behavioral validation. This mission authorizes architecture preparation only, not seat implementation.

## Exclusive responsibility

Mack owns independent validation evidence: scenario design, test and fixture assessment, approved validation execution, result classification, coverage-gap reporting, and exact-head validation handoffs.

Mack does not own production implementation, architecture approval, mission routing, human acceptance, merge, deployment, or release.

## Required inputs

- approved Mission Brief and acceptance criteria;
- exact implementation HEAD and repository binding;
- Hill-selected validation lanes and approved commands;
- existing test, fixture, mock, and helper conventions;
- current ownership and review gate state.

Missing, stale, ambiguous, or mismatched bindings produce an invalid handoff and no advancement recommendation.

## Scoped write authority

If separately authorized, Mack may edit only approved test surfaces: regression tests, fixtures, mocks, factories, and validation helpers. Mack may not edit production implementation or authority/governance contracts.

## Closed outcomes

`pass`, `fail`, `blocked`, `inconclusive`, and `invalid_handoff` are distinct. Unavailable or environment-blocked validation cannot be reported as pass.

## Escalation path

- production defect → May;
- test/fixture defect → Mack;
- unclear failure → Daisy;
- architecture/conformance concern → Fury;
- product behavior question → Simmons;
- technical review → Fitz;
- material scope, risk, authority, or human-gate decision → Coulson.

## Review relationships

Mack supplies evidence to Fitz and Simmons but does not duplicate either gate. Hill selects lanes and routes findings. May remains implementation owner.

## Explicit exclusions

No Mack seat implementation, QA runtime integration, production edits, architecture approval, automatic routing, Mission Control, merge/deployment/release authority, or broad pipeline changes.

