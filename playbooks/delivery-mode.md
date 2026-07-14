# Delivery Mode Playbook

Use this playbook for planned engineering work whose desired outcome is known.
It moves an approved objective through architecture, implementation,
validation, review, and pull-request preparation.

## Goal

Produce the smallest reviewable change that satisfies approved acceptance
criteria while preserving SHIELD seat boundaries and evidence at each gate.

## Workflow

### 1. Mission Intake

Maria Hill:

- clarifies the objective
- gathers the minimum repository and issue context
- identifies dependencies and likely risks
- selects participating seats
- recommends only the modes those seats need
- produces the Mission Brief for Phil Coulson's approval

### 2. Requirements & Scope

Maria Hill records:

- in-scope and out-of-scope behavior
- testable acceptance criteria
- known constraints and dependencies
- the validation plan
- the intended pull request target

Jemma Simmons may review product intent or acceptance criteria when the mission
needs product or domain judgment. Phil Coulson resolves ambiguity and approves
scope or tradeoffs.

### 3. Architecture Review

Daisy Johnson performs planned-work reconnaissance:

- finds similar implementations and reusable components
- locates existing APIs and relevant tests
- gathers evidence that reduces implementation uncertainty

Nick Fury then:

- validates the proposed design against repository patterns
- identifies hidden dependencies and unnecessary complexity
- decides whether the mission should be split
- approves or revises the implementation plan

Architecture approval is required before implementation begins.

### 4. Implementation

Melinda May owns production implementation. She:

- executes only the approved plan
- keeps changes inside the approved scope
- writes or updates focused tests
- reports blockers instead of transferring implementation to Maria Hill
- prepares the implementation summary and pull-request-ready change

Only after every Definition of Ready condition is satisfied may Melinda May
begin implementation.

### 5. Validation

Melinda May identifies focused validation for the implemented behavior. Maria
Hill runs the approved, repeatable checks and records exact results.

- Implementation or test failures return to Melinda May.
- Missing evidence returns to Daisy Johnson.
- Architecture concerns return to Nick Fury.
- Scope or acceptance ambiguity returns to Phil Coulson.

Validation must cover the acceptance criteria and complete successfully, or its
limitations must be explicitly accepted, before technical review begins.

### 6. Technical Review

Leo Fitz reviews:

- maintainability and simplicity
- code quality and technical debt
- test adequacy
- long-term architectural impact

Technical review is a merge-readiness gate unless the designated human reviewer
explicitly waives it.

### 7. Product Review

Jemma Simmons reviews when product or domain feedback is required:

- acceptance criteria and user workflow
- business intent and product completeness
- documentation impact

Product feedback may block scope or acceptance, but it is not automatically a
universal merge gate.

### 8. Pull Request

Melinda May prepares the implementation summary, changed behavior, test
evidence, and known limitations. Maria Hill handles GitHub coordination and
creates or updates the pull request using that material.

The pull request must state:

- what changed and why
- the approved scope and acceptance criteria
- validation results
- technical and product review status
- remaining risks or follow-up work

Phil Coulson accepts or rejects the completed mission. Acceptance does not
bypass required repository review or merge controls.

## Definition of Ready

Before implementation begins:

- [ ] Objective is clear.
- [ ] Scope is defined.
- [ ] Acceptance criteria exist.
- [ ] Architecture is approved.
- [ ] Risks are documented.
- [ ] Required modes are attached to participating seats.
- [ ] Validation plan exists.
- [ ] Pull request target is known.

If any condition is unmet, Maria Hill keeps the mission in intake, requirements,
reconnaissance, or architecture review rather than dispatching implementation.

## Completion record

Record:

- Mission Brief approval
- Definition of Ready status
- per-seat mode attachments
- architecture decision
- implementation and validation summary
- Fitz and Simmons review status
- pull request URL and target
- Coulson's final decision
