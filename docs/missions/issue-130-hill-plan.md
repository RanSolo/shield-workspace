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
implementation → Mack validation → Fury conformance → Coulson final gate.

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

`MissionCycleInputV1` is exactly:

```ts
interface MissionCycleInputV1 {
  repositoryRoot: string;
  configuredJournalPath: string;
  missionId: string;
  expectedRevisionId: string;
  expectedSequence: number;
  seatId: string;
  actionId: string;
  effectClass: RunnerEffectClass;
  validationId: string;
  activatedModes: RunnerModeReference[];
  actionAllowlist: string[];
}

type MissionJournalLocationV1 = Pick<MissionCycleInputV1, "repositoryRoot" | "configuredJournalPath" | "missionId">;
type ProfileAwareJournalSnapshotV1 = {
  entries: ProfileAwareMissionEntryV1[];
  projection: ProfileAwareProjectionV1;
  journalDigest: string;
};
```

It deliberately has no cycle ID or effect key. The runtime derives exactly
`cycle:${missionId}:${expectedRevisionId}:${expectedSequence}:${actionId}` and
`effect:${missionId}:${expectedRevisionId}:${expectedSequence}:${actionId}`.
`MissionCycleDependenciesV1` is exactly:

```ts
interface MissionCycleDependenciesV1 {
  read(input: MissionJournalLocationV1): Promise<ProfileAwareJournalSnapshotV1>;
  append(input: { entry: ProfileAwareMissionEntryV1 }): Promise<ProfileAwareAppendResultV1>;
  authorize(input: RunnerCyclePlan): unknown | Promise<unknown>;
  execute(input: RunnerCyclePlan, decision: RunnerPermissionDecision): unknown | Promise<unknown>;
  validate(input: RunnerCyclePlan, result: RunnerExecutorResult): unknown | Promise<unknown>;
  now(): EvidenceTimestamp;
}
```

`EvidenceTimestamp` is the existing closed type
`{ value: string; provenance: "humanRecorded" | "hostTrusted" }`.
`ProfileAwareAppendResultV1` is exactly
`{ state: "appended"; journalPath: string; entry: ProfileAwareMissionEntryV1 }`
or `{ state: "uncertain"; code: "recovery_required"; error: string }`.

The runtime derives the runner plan from these inputs; callers may not supply
a pre-authorized plan, cycle identity, effect key, or durable entry.

The canonical implementation extends the existing profile-aware schema-9
replay/projection and schema-9 entry validation. It does not coerce schema 9
through the legacy schema-2–8 projection. `ProfileAwareProjectionV1` gains an
authoritative `effects` collection and accepts exactly one new event,
`execution.effect_recorded`, whose payload is the existing runner execution
payload plus `authorizationDecisionId`, `outcome`, `reasonCode`, `summary`,
and `evidenceRefs`. `createProfileAwareExecutionEffectEntryV1(projection,
candidate, timestamp)` is the sole schema-9 entry constructor. The runner
validators and `runRunnerCycle(...)` are extended additively to accept journal
schema 9; legacy schema 5–8 behavior remains unchanged.

The ordered algorithm is:

1. `read` and replay the exact mission journal into `ProfileAwareJournalSnapshotV1`.
2. Require `projection.brief.revisionId === expectedRevisionId` and
   `projection.lastSequence === expectedSequence`. If replay contains the
   derived effect, return `complete` only when successful; return `uncertain`
   for an uncertain effect; never dispatch.
3. If the projection is `not-started`, append an `execution.transition` from
   `not-started` to `running`, then append an `execution.attempt_started` entry
   containing the derived cycle ID, effect key, revision, seat, action, and
   expected effect sequence. Re-read after each append. A missing or ambiguous
   attempt marker is `blocked`; an uncertain append is `uncertain`.
4. If replay contains an attempt marker without its matching effect, return
   `uncertain` with `next:coulson`; do not authorize or dispatch again.
5. Derive the stable plan and call `runRunnerCycle(...)` once.
6. Convert its candidate with `createProfileAwareExecutionEffectEntryV1(...)`.
7. Call `append` once; never retry after `recovery_required`.
8. `read` again and require canonical JSON equality for the appended entry,
   exact mission/revision/sequence/entry ID/cycle/effect identity, and the
   projection invariant `lastSequence === expectedSequence + 1` with exactly
   one new matching effect. The canonical entry ID is exactly
   `entry:${missionId}:${sequence}`; canonical JSON is the existing
   profile-aware `canonicalJson(...)` function.
9. Return the closed next-route result.

The result variants are exactly:

```ts
type MissionCycleReasonCodeV1 =
  | "authorization_wait" | "authorization_denied" | "gate_missing"
  | "stale_revision" | "stale_sequence" | "duplicate_effect"
  | "uncertain_effect" | "attempt_missing" | "attempt_ambiguous"
  | "governance_blocked" | "identity_mismatch" | "seat_not_executable"
  | "action_not_allowlisted" | "execution_transition_invalid"
  | "runner_failed" | "runner_uncertain" | "validator_failed"
  | "append_lock_held" | "append_failed" | "append_recovery_required"
  | "readback_invalid" | "readback_mismatch" | "complete";

type MissionCycleResultV1 =
  | { outcome: "advanced"; missionId: string; subjectId: string; revisionId: string; sequence: number; accountableNextSeat: string | null; cycleId: string; effectKey: string }
  | { outcome: "waiting" | "blocked" | "uncertain" | "complete"; missionId: string; subjectId: string; revisionId: string; sequence: number; accountableNextSeat: string | null; reasonCode: MissionCycleReasonCodeV1 };
```

`accountableNextSeat` is deterministic: `coulson` for authorization, gate,
attempt, append-recovery, and readback failures; the requested `seatId` for
runner/validator/action failures; and `null` only for `complete`.
`MissionCycleReasonCodeV1` maps each existing runner stop reason and journal
error to one outcome. Deterministic failure mapping is:

| Condition | Result |
| --- | --- |
| authorization wait, authorization deny, or pending Coulson gate | `waiting` with `next:coulson` and `authorization_wait`, `authorization_denied`, or `gate_missing` |
| stale, duplicate, malformed, missing authority, invalid identity, lock-held, append failure, readback invalid, or projection mismatch | `blocked` with the exact closed reason code and deterministic next seat above |
| post-dispatch executor/validator stop, uncertain result, or append `recovery_required` | `uncertain` with `next:coulson` and `runner_uncertain`, `uncertain_effect`, or `append_recovery_required` |
| successful append and exact readback | `advanced` |
| replayed execution status is `completed` | `complete` with `next:null` |

The runtime derives stable cycle/effect identities from the durable mission
revision, expected sequence, and requested action, and checks replayed effect
records before authorization. The attempt marker is authoritative recovery
state: once recorded, any restart without a matching successful or uncertain
effect returns `uncertain` and cannot call `authorize`, `execute`, or
`validate`. This converts unknown post-dispatch append state into a safe
human-recovery stop.

For this mission, remove the Fitz final route from the prior generic route:
`standard@1` has only Coulson execution and final-acceptance gates. Fury and
Mack remain process-level review/validation roles and are not added to the
frozen mission participants. Fitz is introduced only by a separately
authorized stronger-profile successor.

Focused tests must cover every result mapping above, schema-9 replay and
entry compatibility, exact post-append canonical JSON/readback invariants,
stale revision/sequence, duplicate and uncertain restart protection, no-
dispatch stops, unchanged schema 5–8 regression behavior, package export,
TypeScript consumer compilation, and packed-package import. The Issue #76
proving mission remains out of scope.
