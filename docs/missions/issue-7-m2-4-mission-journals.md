# Approved Mission Brief: M2-4 Mission Journals and Recovery

- **Canonical issue:** [`RanSolo/shield-workspace#7`](https://github.com/RanSolo/shield-workspace/issues/7)
- **Mission state:** approved
- **Approval source:** Phil Coulson — staged approval and execution after M2-2 merge
- **Dependency satisfied:** M2-2 PR #21 merged as `e819386e6712ece2efe16daa263e050c24b5fde2`
- **Activation path:** explicit Coulson approval; lightweight timeout prohibited
- **Current owner:** Maria Hill

## Objective

Implement a versioned append-only mission journal, deterministic pure replay,
and a repository-safe local JSONL persistence adapter so interrupted missions
can recover durable governance, execution, review, and completed-effect evidence.

## Approved participants

- Maria Hill — coordination, PR workspace, validation, and status
- Daisy Johnson — focused persistence and recovery reconnaissance
- Nick Fury — journal architecture, sequencing, and implementation sanity review
- Melinda May — approved journal contract, adapter, and focused tests
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

- Define a closed, versioned, JSON-serializable journal-entry contract.
- Serialize exactly one complete journal entry per newline-terminated JSONL line.
- Validate contiguous per-mission sequences, unique entry IDs, mission identity,
  caller-supplied timestamp provenance, chronology, and closed payload schemas.
- Preserve governance state as the existing mission-policy projection.
- Derive independent execution status across `not-started`, `running`, `blocked`,
  `failed`, and `completed`.
- Record governance evidence, execution-status transitions, review evidence, and
  effect-completion receipts with stable opaque effect keys.
- Replay into deterministic governance, execution, review, and completed-effect
  projections without environmental reads.
- Add a local adapter confined to an explicit `.shield/journals/` root with a
  traversal-safe mission filename, single-writer exclusion, append-and-flush
  behavior, and fail-closed partial-tail detection.
- Add the journal directory to Git ignore without committing runtime evidence.

## Explicit non-goals

- Mission runner, seat dispatch, scheduling, or model/provider routing
- Executing, retrying, compensating, or automatically skipping side effects
- Automatic journal repair, truncation, or evidence rewriting
- Snapshots, effect caches, cryptographic signing, HMACs, or encryption
- Remote, distributed, database, or multi-user persistence
- UI, Mission Control, GitHub adapters, merge, deploy, publish, or release

## Fury implementation boundaries

- Keep the pure journal contract separate from the Node filesystem adapter.
- Do not alter mission schema v2 merely to represent execution status.
- Journal entries use a journal-specific schema version and closed type-specific
  payloads.
- Governance evidence must validate through the canonical mission event/replay
  APIs rather than duplicating transition authority.
- Execution status uses an explicit independent transition table.
- Effect receipts provide evidence only; future M2-5 runner code decides how to
  use completed effect keys.
- Each journal file belongs to one mission and starts at sequence zero.
- Incomplete or malformed final writes return recovery-required and are never
  silently removed.
- Lock contention and uncertain writes fail closed.
- The adapter receives a trusted base directory and never treats a raw mission ID
  as a filesystem path.

## Validation bar

- Valid governance and execution replay
- Start, block, resume, fail, retry, complete, pause, reject, and cancel paths
- Missing, duplicate, and non-contiguous sequences
- Duplicate entry IDs, mission mismatches, and chronology regression
- Unknown, missing, malformed, inherited, or unsupported entry data
- Conflicting effect receipts and deterministic completed-effect projection
- Review and approval evidence surviving a write/read/replay cycle
- Repository confinement and path-traversal attempts
- Single-writer lock contention and append failure
- Malformed and incomplete final JSONL lines without silent truncation
- Pure replay environmental-independence checks
- Focused journal contract and adapter tests
- Full `@shield/team-system` regression suite
- `git diff --check`
- `npm pack --workspace @shield/team-system --dry-run`
- Fury final implementation sanity review
- Fitz human technical review before final Coulson merge approval

## Stop condition

Stop with a validated draft pull request ready for Fitz and Phil Coulson. Do not
merge, publish, deploy, or expand the mission.
