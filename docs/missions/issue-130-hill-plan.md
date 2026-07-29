# Hill Plan — Canonical Mission Runtime Entry Point

## Ownership

- Hill owns the runtime map, mission route, handoffs, and stop conditions.
- Daisy owns read-only evidence gathering.
- Fury owns architecture and conformance review.
- May owns implementation after authorization.
- Mack owns independent validation.
- Coulson and Fitz remain human gates.

## Phase 1 — Runtime responsibility audit

Create an evidence-backed map for:

1. mission creation and durable loading;
2. replay and current-state projection;
3. next-action and next-seat derivation;
4. mode and runtime-context resolution;
5. Helicarrier dispatch preparation;
6. runner authorization, execution, and result validation;
7. bounded May or Daisy execution;
8. authoritative result construction and journal append;
9. adapter effects and receipts;
10. human-gate and terminal stopping behavior.

For each seam, record its public specifier, authority, caller-owned inputs,
result type, persistence behavior, and known non-goals.

## Phase 2 — Composition decision

Answer whether a supported top-level function already composes the map.

If none exists, propose one thin single-cycle function. Prefer composition by
runtime stage and capability boundary. Keep seat identity in the data and
receipts rather than creating one infrastructure stack per character.

The proposal must define:

- closed input and output shapes;
- injected host dependencies;
- exact replay/readback points;
- one-cycle and at-most-once behavior;
- stale-state and uncertain-effect handling;
- Hill-ready next-route context;
- human-gate stop results;
- compatibility and public-export position.

## Phase 3 — Fury plan gate

Before implementation, Fury reviews the exact committed brief, audit, and
composition proposal for:

- duplicated or bypassed authority;
- hidden scheduler or policy semantics;
- stale replay and at-most-once failures;
- seat/runtime/executor identity conflation;
- simulated human gates;
- unsafe adapter or journal ordering;
- compatibility and public API risk.

Any required correction returns to Hill. May is not dispatched until the exact
plan is approved.

## Phase 4 — Smallest implementation

If authorized, May implements only the approved single-cycle seam and its
public documentation. Existing runner, Helicarrier, permission, tool, adapter,
and supervision contracts remain authoritative.

No broad file reorganization is part of the initial slice. Extraction or
renaming requires evidence that the thin seam cannot be implemented cleanly.

## Phase 5 — Independent validation

Mack verifies:

- journal load and replay;
- ready, waiting, blocked, uncertain, completed, and human-gate outcomes;
- stale sequence and revision rejection;
- at-most-one dispatch and at-most-one durable append;
- no dispatch when authority or runtime binding is missing;
- exact candidate-to-entry binding;
- restart/readback behavior;
- no simulated human evidence;
- packed public API compatibility.

## Proving mission

After the runtime slice passes review, use a separately authorized, narrowed
slice of Issue #76:

> Generate a `minimal` starter pipeline profile for this repository, record
> real discovered commands and unavailable lanes, validate it, and stop at the
> next human gate.

The proof must identify which actions were framework-enforced, prompt-directed,
human-directed, temporary workarounds, or framework defects.

## Current route

Mission Brief approval → Delivery Mode activation → commit brief and audit
artifact → draft Mission Workspace → Fury plan gate → bounded May
implementation → Mack validation → Fury conformance → Fitz human gate.

## Runtime-v2 correction after Fury review

The current runtime-v2 journal is profile-aware schema 9. The next plan must
preserve that begun entry and must not route it through the legacy schema-2
through-schema-8 replay path without an explicit compatibility extension.

The implementation slice is therefore split into two exact contracts:

1. Extend the runner/supervision compatibility surface to accept schema 9 and
   add focused replay, stale-sequence, duplicate-effect, uncertain-effect,
   and restart coverage.
2. Add one thin public `runMissionCycle(input, dependencies)` composition
   surface that performs exactly:

   `read/replay → derive plan → runRunnerCycle → construct authoritative entry → append → read back → exact projection verification`

The composition result is closed and must distinguish `advanced`, `waiting`,
`blocked`, `uncertain`, and `complete`, including the durable sequence and
accountable next seat. Append uncertainty and readback mismatch are blocked
or uncertain stops; they never become successful advancement.

The frozen `standard@1` brief remains authoritative: Coulson is the only
mission execution and final-acceptance gate. Fury review and Mack validation
are process-level review activities, not silently added mission gates; Fitz
is not required unless a new authorized mission revision selects a profile
that requires Fitz.

No May implementation begins until Fury approves this corrected exact plan.

## Exact runtime-v2 contract for the next Fury review

The additive public module is `src/mission-runtime-v1.mts`, exported as
`@shield/team-system/mission-runtime`. Its entry point is:

```ts
runMissionCycle(
  input: MissionCycleInputV1,
  dependencies: MissionCycleDependenciesV1,
): Promise<MissionCycleResultV1>
```

`MissionCycleInputV1` contains exactly the repository root, configured journal
path, mission ID, expected mission revision, expected journal sequence, cycle
ID, seat ID, action ID, effect class, effect key, validation ID, activated
modes, and action allowlist. `MissionCycleDependenciesV1` contains exact
`read`, `append`, `authorize`, `execute`, `validate`, and trusted `now`
functions. The runtime derives the runner plan from these inputs; callers may
not supply a pre-authorized plan or a durable entry.

The canonical implementation extends the existing profile-aware schema-9
replay/projection and schema-9 entry validation. It does not coerce schema 9
through the legacy schema-2–8 projection. The existing runner validators and
`runRunnerCycle(...)` remain additive-compatible while accepting schema 9, and
the profile-aware journal accepts the resulting `execution.effect_recorded`
entry. `createExecutionEffectEntry(...)` is extended or a schema-9 equivalent
is exported from the new module; exactly one path is used by the composition.

The ordered algorithm is:

1. `read` and replay the exact mission journal.
2. Reject stale mission revision or sequence, completed effect key/cycle ID,
   missing authorization, missing frozen gates, or an already uncertain effect
   before calling `authorize`.
3. Derive one stable plan and call `runRunnerCycle(...)` once.
4. Convert its candidate to one schema-9 authoritative entry.
5. Call `append` once; never retry after `recovery_required`.
6. `read` again and require exact mission ID, revision, prior sequence, next
   sequence, entry ID, entry content, cycle ID, effect key, and resulting
   projection.
7. Return the closed next-route result.

The result variants are exactly `advanced`, `waiting`, `blocked`, `uncertain`,
and `complete`; each carries mission ID, subject ID, revision ID, durable
sequence, and accountable next seat. Deterministic failure mapping is:

| Condition | Result |
| --- | --- |
| human authorization wait/deny or pending gate | `waiting` |
| stale, duplicate, malformed, missing, invalid, lock-held, append-failed, readback-invalid, or projection-mismatch input | `blocked` |
| post-dispatch uncertain result or append `recovery_required` | `uncertain` |
| successful append and exact readback | `advanced` |
| replay shows no eligible next action | `complete` |

The runtime derives stable cycle/effect identities from the durable mission
revision, expected sequence, and requested action, and checks replayed effect
records before authorization. This preserves at-most-once behavior across
restart and prevents retry after uncertain external effects.

For this mission, remove the Fitz final route from the prior generic route:
`standard@1` has only Coulson execution and final-acceptance gates. Fury and
Mack remain process-level review/validation roles and are not added to the
frozen mission participants. Fitz is introduced only by a separately
authorized stronger-profile successor.

Focused tests must cover every result mapping above, schema-9 replay and
entry compatibility, exact post-append readback, stale revision/sequence,
duplicate and uncertain restart protection, no-dispatch stops, package export,
and packed-package compatibility. The Issue #76 proving mission remains out
of scope.
