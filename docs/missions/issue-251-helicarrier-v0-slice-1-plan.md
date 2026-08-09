# Hill Plan — Issue #251 Helicarrier Flight Controller Slice 1

## Exact planning basis

- Repository: `RanSolo/shield-workspace`
- Branch: `agent/issue-251-helicarrier-v0-slice-1`
- Base and planning HEAD: `8aa12cb9d16171aa1b5289b75eb5e71128cac858`
- Mission: `mission:issue-251-slice-1`
- Mission revision: `sha256:HivRohiNSFF5NQUFnicklVqT9eBHaG2OXvOTYyBytVU`

This slice starts from merged `main`. Open Feature Flight pull requests are
parts inventory, not Git or runtime dependencies. The existing
`runHelicarrierV0` certified compilation kernel and governed May dispatch API
remain unchanged.

## Objective

Add the smallest deterministic Helicarrier flight-controller boundary: one
effect-free `shield-ops flight status` command that snapshots a prepared closed
Feature Flight plan and state, validates their exact identity and lifecycle
relationship, and returns one advisory next candidate or a deterministic stop.

The command writes JSON only to stdout. It does not initialize or advance
state, reserve or write artifacts, invoke a model or seat, execute a command,
inspect GitHub, mutate a mission journal, or create authority.

## Reuse and naming

- Reuse `readJsonSnapshot`, `exactKeys`, `nonEmptyString`, and SHA-256 helpers
  from `scripts/operations/common.mjs`.
- Preserve the existing Feature Flight vocabulary proven in the repair flight:
  plan, state, sequence, predecessor digest, lanes, dependency waves, mission
  status, exact revision, and authority-none routing advice.
- Implement the new composition boundary as
  `feature-flight-controller.mjs`; do not rename, wrap, or alter
  `src/helicarrier-v0.mts`.
- Wire only `shield-ops flight status` through the existing operations CLI.

## Closed input contracts

### Prepared plan

The controller accepts a closed `feature-flight-resolved-plan` schema version
1. It contains:

- `flightId` and objective;
- canonical repository root, base ref, exact base revision, and integration
  branch;
- ordered lane identities;
- ordered mission records with ID, lane, activation wave, dependency IDs, and
  owned paths;
- a fixed `authority:none` notice.

Unknown fields, duplicate identities, unknown lanes or dependencies,
dependency cycles, noncanonical paths, path-ownership overlap, invalid Git
revisions, and ordering ambiguity fail closed.

### Current state

The controller accepts a closed `feature-flight-state` schema version 2 bound
to the exact plan byte identity. It contains:

- `flightId`, plan SHA-256, sequence, and predecessor SHA-256;
- the same repository identity;
- current wave;
- exact lane and mission membership;
- each mission's status and optional exact revision;
- fixed `authority:none` and freshness limitations.

The caller must independently provide the exact plan SHA-256, state SHA-256,
and state sequence. A non-genesis state must also provide the exact predecessor
state and digest. These checks prove only the supplied chain, never that it is
globally latest.

Authority-derived mission states (`authorized`, `active`, `complete`, and
`integrated`) are never treated as verified authority by this slice. They
produce a stop requiring an existing trusted authority verifier in a later
slice.

## Deterministic projection

After validation, preserve plan order and classify each mission:

- integrated dependencies and `planned` status: candidate
  `request-exact-child-authorization`;
- unmet dependencies: blocked with the exact dependency IDs;
- `blocked` or `failed`: stop for operator disposition;
- authority-derived status: stop for independent authority verification;
- `cancelled` or `superseded`: terminal and never reactivated;
- all missions integrated: flight complete, with no candidate.

Choose at most one candidate: the first candidate in the lowest active wave,
preserving plan order. A lane with an active mission, multiple active missions
in one lane, lifecycle regression, revision clearing/substitution, membership
drift, or ambiguous candidate state fails closed.

## Closed output

Return a closed `shield-feature-flight-status` schema-version-1 JSON document
containing:

- `authority: "none"`, `gateEligible: false`, and a fixed advisory notice;
- exact plan, state, and predecessor byte identities;
- flight ID, state sequence, current wave, and freshness limitation;
- one `nextCandidate` or `null`;
- deterministic mission projections and stop reasons;
- fixed controller name and version.

No PASS, approval, readiness-to-dispatch, or human decision is emitted.

## Files

- Add `packages/shield-team-system/scripts/operations/feature-flight-controller.mjs`.
- Update `packages/shield-team-system/scripts/operations/ops-cli.mjs`.
- Add `packages/shield-team-system/tests/operations-feature-flight-controller.test.mjs`.
- Update `packages/shield-team-system/tests/operations-cli.test.mjs`.
- Add mirrored operator documentation at:
  - `docs/operations/helicarrier-v0-controller.md`;
  - `packages/shield-team-system/docs/operations/helicarrier-v0-controller.md`.
- Update `packages/shield-team-system/README.md` and
  `packages/shield-team-system/tests/package-surface.test.mjs` so the installed
  package exposes and documents the command.

## Required tests

1. A valid genesis plan/state produces exactly one deterministic candidate.
2. Plan array order, not object-key enumeration or locale, breaks ties.
3. Completed dependencies unlock the next wave; unmet dependencies remain
   explicit.
4. Fully integrated state returns no candidate.
5. Exact plan/state digest and sequence drift fail closed.
6. Non-genesis predecessor absence, digest mismatch, sequence discontinuity,
   cross-flight replay, and cross-plan replay fail closed.
7. Unknown fields and identity membership drift fail closed at every level.
8. Dependency cycles, ownership collisions, lane ambiguity, lifecycle
   regression, and revision substitution fail closed.
9. Authority-derived states stop for verification and never become
   `dispatch_ready`.
10. Cancelled or superseded missions never reactivate.
11. CLI help, unsupported commands, malformed input, and JSON output are
    covered through the real operations CLI.
12. Packed installation includes both the command and operator documentation.

Run focused tests, package-surface/pack validation, the full team-system suite,
and Multiband tests. Mack validates the exact implementation revision; Fury
then performs exact-revision conformance review.

## Explicit exclusions

- No `run --max-steps`, resume, execute-once claim, successor-state write, or
  recovery mutation in Slice 1.
- No May, Daisy, Mack, Fury, model, command, GitHub, or adapter invocation.
- No new authority class, signed-evidence format, or journal schema.
- No live remote-drift or divergent-history reconciliation yet.
- No automatic merge, deployment, release, cleanup, or final acceptance.
- No wholesale cherry-pick, merge, or dependency on PRs #243–#250.
