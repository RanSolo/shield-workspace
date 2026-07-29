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
`@shield/team-system/mission-runtime`:

```ts
runMissionCycle(
  input: MissionCycleInputV1,
  dependencies: MissionCycleDependenciesV1,
): Promise<MissionCycleResultV1>
```

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

interface ProfileAwareJournalSnapshotV1 {
  entries: ProfileAwareMissionEntryV1[];
  projection: ProfileAwareProjectionV1;
  journalDigest: string;
}

interface MissionCycleDependenciesV1 {
  readJournal(input: {
    repositoryRoot: string;
    configuredJournalPath: string;
    missionId: string;
  }): Promise<ProfileAwareJournalSnapshotV1>;
  appendJournal(input: {
    repositoryRoot: string;
    configuredJournalPath: string;
    missionId: string;
    entry: ProfileAwareMissionEntryV1;
  }): Promise<
    | { state: "appended"; journalPath: string }
    | { state: "blocked"; code: "journal_lock_held" | "journal_unavailable"; errors: string[] }
    | { state: "uncertain"; code: "recovery_required"; errors: string[] }
  >;
  readPermissionAuditLedger(): Promise<unknown>;
  authorize(input: RunnerCyclePlan): unknown | Promise<unknown>;
  execute(
    input: RunnerCyclePlan,
    decision: RunnerPermissionDecision,
  ): unknown | Promise<unknown>;
  validate(
    input: RunnerCyclePlan,
    result: RunnerExecutorResult,
  ): unknown | Promise<unknown>;
  now(): EvidenceTimestamp;
}
```

`authorize` must be produced by `createPermissionAuthorizer(...)`, and
`execute` must be produced by `createAuditedExecutor(...)`. Their shared
`appendIfAbsent` dependency durably records the exact permission decision,
`tool.invocation` before external execution, and one completed, failed, or
uncertain `tool.result`. An invocation record consumes its decision and is the
authoritative redispatch barrier. The runtime validates snapshots through
`replayPermissionAuditLedger(...)`; raw or malformed audit arrays fail closed.

The input deliberately has no caller-supplied cycle ID or effect key. After
the journal is in `running` state at sequence `R`, the runtime derives exactly:

```text
cycle:${missionId}:${expectedRevisionId}:${R}:${actionId}
effect:${missionId}:${expectedRevisionId}:${R}:${actionId}
```

The runner plan and permission decision both bind
`evaluatedThroughSequence: R`. Its candidate binds
`expectedPreviousSequence: R` and `intendedJournalSequence: R + 1`.

### Canonical schema-9 extension

Schema 9 keeps `replayProfileAwareMissionJournal(...)` and
`ProfileAwareProjectionV1` as its sole canonical replay/projection. The
projection gains `effects: RunnerExecutionEffectPayload[]`. Schema 9 accepts
one additive event, `execution.effect_recorded`, with the existing closed
runner execution payload. `createProfileAwareExecutionEffectEntryV1(...)` is
the only schema-9 effect-entry constructor. It requires authorization, frozen
profile gates, `execution === "running"`, current sequence/revision identity,
and no duplicate cycle ID or effect key.

Runner inputs and candidates add schema 9 to their existing schema 5–8 union.
Legacy schemas and `createExecutionEffectEntry(...)` are unchanged.

### Ordered algorithm and sequences

Let `S` be `expectedSequence`.

1. Read and replay the exact journal. Reject a stale revision or sequence.
2. If mission authorization or a frozen gate is pending, return `waiting`
   with `coulson`; do not append, authorize, or dispatch. This is the current
   sequence-0 outcome for `mission:issue-130-runtime-v2`.
3. If execution is `completed`, return `complete`. If an uncertain effect is
   replayed, return `uncertain`. Neither path dispatches.
4. If execution is `not-started`, append `execution.transition` at `S + 1`,
   re-read, and require canonical equality for that exact entry plus
   `execution === "running"` and `lastSequence === S + 1`. Set `R = S + 1`.
   If execution is already `running`, set `R = S` without appending.
5. Derive the cycle/effect identities from `R`. Replay the permission audit
   ledger before calling the runner:
   - no matching invocation permits one runner call;
   - a matching invocation with no result, or with failed/uncertain result,
     returns `uncertain` with `coulson`;
   - a matching completed result without the matching journal effect returns
     `uncertain` with `coulson`;
   - a matching completed journal effect returns `complete`.
6. Call `runRunnerCycle(...)` once with the audited authorizer/executor.
7. A pre-dispatch runner stop returns `waiting` or `blocked` without journal
   append. A post-dispatch stop must carry an uncertain effect candidate.
8. Convert an advanced or uncertain candidate through
   `createProfileAwareExecutionEffectEntryV1(...)`, append it at `R + 1`, and
   never retry a `recovery_required` append.
9. Re-read and require:
   - `canonicalJson(entries[R + 1]) === canonicalJson(expectedEntry)`;
   - entry ID `entry:${missionId}:${R + 1}`;
   - exact mission, revision, cycle ID, effect key, and sequence;
   - `projection.lastSequence === R + 1`;
   - exactly one matching effect with the recorded outcome; and
   - a changed journal digest.
10. Return `advanced` only after all readback invariants pass.

### Closed results and routing

```ts
type MissionCycleReasonCodeV1 =
  | "mission_authorization_required" | "gate_missing"
  | RunnerStopReason
  | "stale_revision" | "stale_sequence" | "duplicate_effect"
  | "audit_invalid" | "audit_incomplete" | "audit_result_uncertain"
  | "journal_lock_held" | "journal_unavailable" | "recovery_required"
  | "transition_readback_mismatch" | "effect_readback_mismatch"
  | "complete";

type MissionCycleResultV1 =
  | {
      outcome: "advanced";
      missionId: string;
      subjectId: string;
      revisionId: string;
      sequence: number;
      accountableNextSeat: "hill";
      cycleId: string;
      effectKey: string;
    }
  | {
      outcome: "waiting" | "blocked" | "uncertain" | "complete";
      missionId: string;
      subjectId: string;
      revisionId: string;
      sequence: number;
      accountableNextSeat: string | null;
      reasonCode: MissionCycleReasonCodeV1;
    };
```

Exact mapping:

- `waiting`, `coulson`: `mission_authorization_required`, `gate_missing`,
  `authorization_wait`, and `authorization_denied`.
- `blocked`, requested `seatId`: `identity_mismatch`,
  `seat_not_participating`, `seat_not_executable`,
  `implementation_owner_mismatch`, `mode_context_mismatch`,
  `action_not_allowlisted`, `authorization_failed`,
  `authorization_malformed`, and `authorization_stale`.
- `blocked`, `coulson`: `governance_not_approved`,
  `mission_not_authorized`, `execution_not_active`, `execute_not_ready`,
  `journal_sequence_mismatch`, `stale_revision`, `stale_sequence`,
  `duplicate_effect`, `audit_invalid`, `journal_lock_held`,
  `journal_unavailable`, `transition_readback_mismatch`, and
  `effect_readback_mismatch`.
- `uncertain`, `coulson`: `effect_outcome_uncertain`, `audit_incomplete`,
  `audit_result_uncertain`, `executor_failed`, `executor_uncertain`,
  `executor_malformed`, `executor_identity_mismatch`, `validator_failed`,
  `validator_malformed`, `validator_identity_mismatch`, and
  `recovery_required`.
- `complete`, `null`: replayed successful matching effect or completed
  execution.
- `advanced`, `hill`: successful effect append and exact readback.
- `effect_already_completed` is normalized to `complete`, never redispatched.

`standard@1` remains Coulson-only for execution and final acceptance. Fury and
Mack are process review/validation roles, not added gates. Fitz is introduced
only by a separately authorized stronger-profile successor.

Focused tests bind the final event/sequence model: current unauthorized
sequence-0 waiting/no-dispatch; transition at `S + 1`; effect at `R + 1`;
schema-9 completed and uncertain replay; audit-ledger redispatch prevention;
stale revision/sequence; duplicate cycle/effect; append uncertainty; exact
transition/effect readback; every runner-stop mapping; unchanged schema 5–8
tests; package export import; TypeScript consumer compile; and packed-tarball
import. Issue #76 remains out of scope.
