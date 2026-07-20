# Delivery Mode Playbook

Use this playbook for planned engineering work whose desired outcome is known.
It moves an approved objective through architecture, implementation,
validation, review, and pull-request preparation.

Delivery Mode begins with `./begin-mission.md`. Because Delivery Mode always
involves specialist dispatch for planned engineering work, it requires explicit
Phil Coulson approval and cannot activate through the lightweight operational
timeout path.

## Goal

Produce the smallest reviewable change that satisfies approved acceptance
criteria while preserving SHIELD seat boundaries and evidence at each gate.

## Workflow

### 1. Mission Intake

Follow `./begin-mission.md` to create the Mission Brief, record recommended
versus activated modes, and obtain Phil Coulson's explicit approval before
specialist dispatch. Delivery Mode is never eligible for the lightweight
operational timeout path.

Maria Hill:

- clarifies the objective
- gathers the minimum repository and issue context
- identifies dependencies and likely risks
- produces the draft Mission Brief
- records recommended participants and modes in the Mission Brief
- presents the completed Mission Brief for Phil Coulson's approval

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

### 3. Blueprint and Early Fury Architecture Gate

Daisy Johnson performs planned-work reconnaissance:

- finds similar implementations and reusable components
- locates existing APIs and relevant tests
- gathers evidence that reduces implementation uncertainty

Melinda May owns the implementation blueprint embedded in the committed Mission
Brief. After Hill creates and verifies the early draft PR Mission Workspace,
Nick Fury reviews that exact blueprint head. Fury then:

- validates the proposed design against repository patterns
- identifies hidden dependencies and unnecessary complexity
- decides whether the mission should be split
- gives brief, high-leverage guidance that sharpens Daisy Johnson's findings and Melinda May's execution plan
- records `PASS`, `PASS_WITH_REQUIRED_CHANGES`, or `FAIL` against the exact
  repository, branches, PR, artifact identity, ownership, and revision

`PASS_WITH_REQUIRED_CHANGES` permits one bounded May correction only when Hill
verifies that every prescribed finding was incorporated and no additional
unprescribed change occurred. A genuine architecture, scope, authority,
subject, or ownership change requires renewed Fury review. The gate is
host-asserted, stateless, and non-authoritative; Coulson approval remains
independently required.

### 4. PR Mission Workspace

Maria Hill validates the approved workspace plan through
`../contracts/workspace-contract.mjs`, then calls
`../github/delivery-workspace.mjs:prepareDeliveryWorkspaceForDispatch`. The
guard creates or refreshes the open draft pull request through the existing
`../github/pr-workspace.mjs` publication mechanics. The approved Mission Brief
must already be tracked, clean, and committed on the expected mission branch.
The PR body records objective, approval, participants, activated modes,
validation status, pending decisions, and the team handoff without publishing
secrets or private model reasoning.

If GitHub lookup, branch push, PR creation, update, or exact receipt verification
fails, Hill records the blocked result and returns to Coulson. Repository,
branch, artifact revision, pull-request identity, open state, and draft state
must all match. Hill first calls the guard with explicit `planGate: null`.
Successful readback returns `workspace_ready`, which is not implementation
permission. Hill calls the guard again with the exact Fury record and any
bounded reconciliation; repeated publication reuses and reverifies the
existing draft. Specialist implementation does not begin unless the guard
returns literal `dispatch_ready` with the verified receipt and eligible
plan-gate evaluation.

Hill appends major human-facing handoffs with seat-derived attribution. Routine
internal journal events are not published, and final PR-body updates never
replace the chronological handoff trail.

### 5. Implementation

Melinda May owns production implementation. She:

- executes only the approved plan
- keeps changes inside the approved scope
- writes or updates focused tests
- reports blockers instead of transferring implementation to Maria Hill
- prepares the implementation summary and pull-request-ready change

Only after every Definition of Ready condition is satisfied may Melinda May
begin implementation. Delivery Mode cannot treat silence or timeout as approval.

### 6. Validation

Melinda May identifies focused validation for the implemented behavior. Maria
Hill runs the approved, repeatable checks and records exact results.

- Implementation or test failures return to Melinda May.
- Missing evidence returns to Daisy Johnson.
- Architecture concerns return to Nick Fury.
- Scope or acceptance ambiguity returns to Phil Coulson.

Validation must cover the acceptance criteria and complete successfully, or its
limitations must be explicitly accepted, before technical review begins.

### 7. Fury Implementation Sanity Review

Nick Fury performs a brief final architecture sanity pass before technical
review:

- checks that the implementation still matches the approved plan
- spots hidden architectural drift, accidental scope growth, or risky shortcuts
- sends the work back with concise guidance when the cheaper seats need one more
  correction loop
- marks the change ready for technical review when the implementation remains
  small, safe, and aligned with the approved plan

Before technical review begins, Maria Hill creates or updates a draft pull
request with Melinda May's implementation summary, validation evidence, and the
current scope statement so Leo Fitz has a review surface.

### 8. Technical Review

Leo Fitz reviews:

- maintainability and simplicity
- code quality and technical debt
- test adequacy
- long-term architectural impact

Technical review is a merge-readiness gate unless the designated human reviewer
explicitly waives it.

### 9. Product Review

Jemma Simmons reviews when product or domain feedback is required:

- acceptance criteria and user workflow
- business intent and product completeness
- documentation impact

Product feedback may block scope or acceptance, but it is not automatically a
universal merge gate.

### 10. Pull Request Finalization

After technical and product review, Melinda May updates the implementation
summary, changed behavior, test evidence, and known limitations as needed.
Maria Hill handles GitHub coordination and updates the pull request using that
material.

The pull request must state:

- what changed and why
- the approved scope and acceptance criteria
- validation results
- Fury implementation sanity-review status
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
- [ ] Approved Mission Brief is committed on the mission branch.
- [ ] Verified draft PR Mission Workspace exists.
- [ ] Fury plan review binds the exact current May-owned blueprint revision.
- [ ] The Fury plan gate is eligible, including complete bounded reconciliation
      when the verdict requires changes.

If any condition is unmet, Maria Hill keeps the mission in intake, requirements,
reconnaissance, or architecture review rather than dispatching implementation.

## Completion record

Record:

- Mission Brief approval
- Definition of Ready status
- per-seat mode attachments
- architecture decision
- exact Fury plan-gate verdict and reconciliation status
- implementation and validation summary
- Fury implementation sanity-review status
- Fitz and Simmons review status
- pull request URL and target
- Coulson's final decision
