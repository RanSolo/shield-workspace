# Approved Mission Brief: K2-4.5 Human Authority and Evidence Gates

- **Canonical issue:** [`RanSolo/shield-workspace#23`](https://github.com/RanSolo/shield-workspace/issues/23)
- **Mission state:** approved
- **Approval source:** Phil Coulson — explicit `Wheels Up` in the recovered Codex task on 2026-07-18
- **Dependencies satisfied:** M2-1 issue #2 and M2-4 issue #7
- **Current owner:** Maria Hill

## Objective

Publish the SHIELD kernel boundary and formal, adapter-neutral semantics for human
authority, revision-bound evidence, deterministic waivers and supersession,
readiness, replay, and waiting.

## Approved scope

- Record and apply the Kernel Test.
- Define kernel ownership and explicit exclusions.
- Define the host-neutral adapter and runner boundaries.
- Define Coulson, Fitz, and Simmons as human authority seats.
- Define trusted human-seat bindings without permitting delegated identity.
- Define closed evidence requirement, record, waiver, and supersession shapes.
- Define deterministic readiness and waiting projections.
- Define journal ordering, replay, and fail-closed behavior.
- Validate the specification with adapter-neutral tabletop scenarios and
  invariants.

## Explicit non-goals

- Runtime or journal-schema implementation
- Host APIs, polling, scheduling, communication delivery, or UI
- Model invocation, runner dispatch, or provider routing
- Filesystem, deployment, merge, release, or other external effects
- Treating GitHub or any other host as an architectural special case

## Human authority boundary

Coulson accepted the K2-4.5 specification gate and authorized this repository
delivery. No agent or model occupies or simulates Coulson, Fitz, or Simmons.
Future runtime implementation requires its own mission scope and cannot be
inferred from this approval.

## Deliverables

- [ADR 0001 — Define the SHIELD Kernel Boundary](../adr/0001-define-shield-kernel-boundary.md)
- [K2-4.5 Human Authority, Evidence, Readiness, and Waiting Specification](../specifications/k2-4.5-human-authority-evidence-readiness.md)
- [K2-4.5 Tabletop and Invariant Validation](../validation/k2-4.5-tabletop-and-invariants.md)

## Stop condition

Stop with repository documentation validated and ready for human review. Do not
implement runtime contracts, merge, publish, deploy, or release.
