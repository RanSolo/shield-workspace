# Delivery Mode

Use Delivery Mode for planned engineering work with a known outcome that must
move from approved requirements to a review-ready pull request.

Delivery Mode answers:

> We know what we want to build. Deliver it.

Use Debugger Mode instead when the primary task is to explain a defect, failing
test, or unclear behavior before the correct change is known.

## Lead seats

- **Maria Hill (Orchestrator)** owns intake, routing, operational coordination,
  validation runs, and mission status.
- **Melinda May (Implementer)** owns production implementation after the
  Definition of Ready is satisfied and the plan is approved.

Follow `../playbooks/delivery-mode.md` for the canonical delivery workflow.
Delivery Mode begins with `../playbooks/begin-mission.md`.

## Participating-seat responsibilities

- **Maria Hill** clarifies the objective, records scope and acceptance criteria,
  identifies dependencies, recommends participants and modes, and produces the
  Mission Brief.
- **Daisy Johnson** finds similar implementations, reusable components,
  existing APIs, relevant tests, and other evidence that reduces implementation
  uncertainty.
- **Nick Fury** reviews the architecture, hidden dependencies, reuse of existing
  patterns, unnecessary complexity, whether the mission should be split, and
  whether the implementation still matches the approved plan before technical
  review.
- **Melinda May** executes only the approved plan, writes or updates tests, and
  prepares the implementation summary and pull-request-ready change.
- **Leo Fitz** performs the technical review for maintainability, simplicity,
  technical debt, code quality, and long-term architecture.
- **Jemma Simmons** reviews acceptance criteria, user workflow, business intent,
  documentation, and product completeness when product review is required.
- **Phil Coulson** approves the Mission Brief, resolves ambiguity and tradeoffs,
  and accepts or rejects the completed mission.

Only participating seats receive Delivery Mode context for a mission.

## Delivery contract

- Do not begin implementation until the Definition of Ready is satisfied.
- Require explicit Phil Coulson approval before specialist dispatch.
- Delivery Mode cannot use the lightweight operational timeout path.
- Do not expand scope without Phil Coulson's approval.
- Prefer existing repository patterns and reusable components.
- Keep reconnaissance separate from implementation ownership.
- Record validation evidence before technical or product review is declared
  complete.
- Do not declare the branch merge-ready until the required technical review is
  satisfied or explicitly waived by the designated human reviewer.

## Outputs

Delivery Mode should end with:

- an approved Mission Brief
- documented requirements, scope, and acceptance criteria
- an approved architecture and implementation plan
- a focused implementation with tests
- recorded validation evidence
- Fury implementation sanity-review status
- technical and product review status
- a review-ready pull request

## Context-efficiency rule

Attach only the modes each participating seat needs. Add expertise during the
mission through the agent-request flow rather than loading every available mode
up front.
