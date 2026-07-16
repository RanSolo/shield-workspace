# Approved Mission Brief: M2-1 Mission Schema and Event Model

- **Canonical issue:** [`RanSolo/shield-workspace#2`](https://github.com/RanSolo/shield-workspace/issues/2)
- **Mission state:** approved
- **Approval source:** Phil Coulson — `APPROVE` and `WHEELS UP`
- **Approved at:** 2026-07-16T03:09:51Z
- **Activation path:** explicit Coulson approval; lightweight timeout prohibited
- **Current owner:** Maria Hill

## Objective

Implement one strict, JSON-serializable contract for mission records and mission
events, plus pure deterministic state replay, while preserving the existing
`mission-policy.mjs` public API and transition behavior.

## Approved participants

- Maria Hill — coordination, PR workspace, validation, and status
- Daisy Johnson — focused policy and test reconnaissance
- Nick Fury — contract shape, sequencing, and implementation sanity review
- Melinda May — approved contract implementation and focused tests
- Phil Coulson — scope, repair, merge, and final authority

Fitz and Simmons are out of scope unless explicitly requested.

## Activated modes

- Delivery Mode

## Risk flags

- production: false
- destructive: false
- migration: false
- credentialsOrSecurity: false
- externalCommunication: true
- merge: false
- deploy: false
- release: false
- hillHighRisk: true

## Approved scope

- Add one focused contract module for mission records, mission events,
  validation, and deterministic replay.
- Support the initial stable event types `mission.created` and
  `mission.decision`.
- Keep participating-seat and activated-mode references in the mission record.
- Require caller-supplied timestamps and timestamp provenance.
- Replay by explicit integer sequence.
- Validate chronology, mission identity, transition continuity, declared versus
  replayed state, unknown fields, malformed records, and inherited data.
- Delegate transition authority to the existing `getMissionTransition()` API.
- Preserve the public API of `mission-policy.mjs`.
- Document the boundary with later persistence, mode loading, and runner work.

## Explicit non-goals

- Persistence, journals, storage, or recovery
- Filesystem or clock access
- GitHub or other host adapters
- Model or provider routing
- Mode loading, registry, or validation
- Runner dispatch, repair execution, scheduling, or automatic wait/resume
- Permission enforcement or UI
- Merge, deploy, or release

## Fury implementation shape

- One pure contract module in `packages/shield-team-system/contracts/`.
- Versioned, closed schemas with own-property and plain-object validation.
- Mission records carry participants and activated-mode references.
- Events carry caller-provided identifiers, sequence, timestamps, provenance,
  actor/source, and event-specific decision metadata.
- Replay uses the ordered event sequence and calls `getMissionTransition()` for
  every decision transition.
- Mission creation establishes `proposed`; subsequent decisions must be
  continuous with the prior resulting state.
- Validation returns explicit success or fail-closed error records and performs
  no environmental reads.

## Validation bar

- Valid mission creation and replay
- Valid approve, pause, resume, reject, and cancel policy paths
- Invalid, duplicate, and missing sequence positions
- Timestamp chronology regression
- Mismatched mission identifiers
- Invalid `resumeState` and impossible transitions
- Declared/replayed state mismatch
- Unknown fields and prototype-backed objects
- Deterministic replay without environmental dependencies
- Focused contract tests
- Full `@shield/team-system` regression suite
- `git diff --check`
- `npm pack --workspace @shield/team-system --dry-run`
- Fury final implementation sanity review

## Stop condition

Stop with a validated draft pull request ready for Phil Coulson's final review.
Do not merge.
