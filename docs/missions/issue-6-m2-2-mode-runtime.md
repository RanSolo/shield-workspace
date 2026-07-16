# Approved Mission Brief: M2-2 Mode Runtime Foundation

- **Canonical issue:** [`RanSolo/shield-workspace#6`](https://github.com/RanSolo/shield-workspace/issues/6)
- **Mission state:** approved
- **Approval source:** Phil Coulson — `APPROVE` and `WHEELS UP`
- **Approved at:** 2026-07-16
- **Activation path:** explicit Coulson approval; lightweight timeout prohibited
- **Current owner:** Maria Hill

## Objective

Implement a strict runtime foundation for versioned mode manifests, fail-closed
validation, deterministic registry resolution, and per-seat context loading. Advance
the canonical mission record to schema version 2 so every activated mode records
its exact version as part of reproducible mission identity.

## Approved participants

- Maria Hill — coordination, PR workspace, validation, and status
- Daisy Johnson — focused reconnaissance of current mode and mission contracts
- Nick Fury — schema shape, compatibility decisions, and implementation sanity review
- Melinda May — approved contract implementation and focused tests
- Phil Coulson — scope, repair, merge, and final authority

Fitz performs the human technical review after implementation. Simmons is out of
scope unless explicitly requested.

## Activated modes

- Delivery Mode
- Reconnaissance Mode
- Architecture Review Mode
- Implementation Mode
- Validation Mode

## Risk flags

- production: false
- destructive: false
- migration: true
- credentialsOrSecurity: false
- externalCommunication: true
- merge: false
- deploy: false
- release: false
- hillHighRisk: true

## Approved scope

- Define a versioned, closed, JSON-serializable mode-manifest schema.
- Validate stable identifiers, versions, descriptions, compatibility metadata,
  and bounded context references.
- Reject malformed, missing, unknown, inherited, duplicate, or incompatible data.
- Provide deterministic exact-version registry resolution without implicit mode
  creation, promotion, or fallback.
- Resolve context only for participating seats and their explicitly activated modes.
- Keep seat identity and authority independent from attached expertise.
- Advance mission records to schema version 2 and add `modeVersion` to every
  activated-mode reference.
- Return an explicit unsupported-schema-version diagnostic for version-1 records.
- Preserve the existing exported mission-record and mission-policy function names.

## Explicit non-goals

- Filesystem or provider adapters
- Model routing or escalation
- Runner dispatch or scheduling
- Persistence, journals, or recovery
- Operator CLI or domain-mode content
- UI, merge, deploy, publish, or release

## Fury implementation shape

- Keep validation and resolution pure and free of environmental reads.
- Use closed schemas, own-property checks, and plain-object validation throughout.
- Resolve modes by the exact `modeId` and `modeVersion` pair.
- Make registry construction deterministic and reject duplicate exact references.
- Treat participant membership and seat compatibility as independent gates.
- Return explicit valid/invalid result records consistent with M2-1.
- Advance `MISSION_SCHEMA_VERSION` to 2; reject version 1 with a specific
  unsupported-version error rather than a generic validation error.

## Validation bar

- Valid manifests and exact-version resolution
- Missing, malformed, unknown, inherited, and duplicate manifest data
- Unknown modes and incompatible seats or versions
- Per-seat context isolation and non-participant rejection
- Mission schema v2 activated-mode validation
- Explicit version-1 unsupported-schema diagnostics
- Focused M2-2 tests
- Full `@shield/team-system` regression suite
- `git diff --check`
- `npm pack --workspace @shield/team-system --dry-run`
- Fury final implementation sanity review
- Fitz human technical review before final Coulson merge approval

## Stop condition

Stop with a validated draft pull request ready for Fitz and Phil Coulson. Do not
merge, publish, deploy, or expand the mission.
