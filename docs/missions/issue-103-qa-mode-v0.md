# Mission Brief — Issue #103 QA Mode v0

## Objective

Define QA Mode as a governed behavioral-validation procedure that answers what user-visible behavior must be proven before a change advances. QA Mode is not a seat, authority source, or replacement for Mack, Fury, Fitz, or Simmons.

## Procedure boundary

QA Mode derives scenarios from the approved Mission Brief and acceptance criteria, inspects existing test conventions, proves regression behavior where practical, classifies validation outcomes, binds evidence to the exact artifact HEAD, and produces a concise review checklist.

## Ownership

- Hill selects required validation lanes and routes findings.
- Mack owns independent validation evidence; #95 is now merged and exposes the `mack.validation.v0` evaluator consumed by QA Mode.
- May owns production implementation.
- Daisy investigates unclear failures.
- Fury reviews architecture and conformance.
- Fitz remains the human technical-review gate.
- Simmons remains the product-review gate.
- Coulson decides material human-gate questions.

## Closed outcome classes

`passed`, `failed`, `unavailable`, `misconfigured`, and `environment_blocked` are distinct. Unavailable or blocked validation cannot be reported as passing.

## Explicit exclusions

No product-requirement changes, production edits merely to satisfy tests, invented commands, architecture approval, automatic routing, merge/deploy/release authority, or replacement of human review.

## Required gates

Hill operational readiness → Fury procedure/threat review → Coulson-authorized implementation → Mack proving mission → Fury conformance → Fitz technical review.

## Stop conditions

Stop and return to Coulson if QA Mode would redefine requirements, weaken validation, alter production authority, replace Fitz/Simmons, invent environment behavior, or require changes outside the approved procedure.

## Implementation slice

`qa.mode.v0` is a pure handoff/evaluation boundary layered over Mack v0. It
prepares a side-effect-free approved-lane execution plan but does not execute
commands or grant authority. Hill freezes the mission brief, acceptance
criteria, exact repository/head, scenario set, approved lane/command IDs, lane
evidence references, and approved test surfaces. Mack evidence is evaluated
against that exact packet, including the Mission Brief revision; stale,
mismatched, unapproved, missing, failed, unavailable, or inconclusive evidence
cannot advance as pass.
