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
- at-most-one dispatch, at-most-one transition append, and at-most-one effect
  append;
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
  input: unknown,
  dependencies: MissionCycleDependenciesV1,
): Promise<MissionCycleResultV1>
```

```ts
interface MissionCycleInputV1 {
  repositoryRoot: string;
  configuredJournalPath: string;
  missionId: string;
  expectedSubjectId: string;
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
    | { state: "blocked"; code: "journal_lock_held" | "journal_unavailable" | "stale_sequence"; errors: string[] }
    | { state: "uncertain"; code: "recovery_required"; errors: string[] }
  >;
  permissionAudit: {
    ledgerId: string;
    read(): Promise<unknown>;
    appendIfAbsent(record: PermissionAuditRecord): Promise<unknown>;
  };
  getPermissionContext(
    input: RunnerCyclePlan,
    expectedDecisionId: string,
  ): unknown | Promise<unknown>;
  executeTool(
    input: RunnerCyclePlan,
    decision: RunnerPermissionDecision,
  ): unknown | Promise<unknown>;
  requiredCapabilities(input: RunnerCyclePlan): string[];
  validate(
    input: RunnerCyclePlan,
    result: RunnerExecutorResult,
  ): unknown | Promise<unknown>;
  now(): EvidenceTimestamp;
}
```

The public dependency surface does not accept an authorizer or an audited
executor. `runMissionCycle(...)` constructs both internally with
`createPermissionAuthorizer(...)` and the additive
`createRuntimeClaimedExecutorV1(...)`, using the same closed `permissionAudit`
capability, exact deterministic decision ID, permission-context provider, raw
`executeTool`, capabilities, and clock. The latter returns a paired
`{ claim, execute }` closure: only its `claim` can authorize its `execute`.
Consequently a caller cannot replace the authorizer, claim, or executor while
still satisfying the runtime contract.

Runner v1 receives one additive optional dependency,
`claim(plan, decision)`, and closed result
`{ outcome: "claimed" } | { outcome: "blocked"; reason:
"invocation_claim_conflict" | "invocation_claim_failed" }`. When present, the
runner calls it after a valid allow decision and before `execute`. A blocked
result, thrown claim, or malformed claim returns the additive
`invocation_claim_conflict`, `invocation_claim_failed`, or
`invocation_claim_malformed` runner stop respectively, always with no effect
candidate; the executor is not called. When absent, all schema-5–8 behavior
and existing `createAuditedExecutor(...)` call ordering remain unchanged.

The runtime-only claimed executor uses permission audit schema v1 without
changing existing record JSON or legacy record IDs. `appendIfAbsent` remains
atomic by `recordId`. Its `tool.invocation` record ID is
`runtime-invocation:<claimDigest>`, where `claimDigest` is the fixed-length
SHA-256 base64url digest of the canonical closed object
`{ domain: "shield.permission-invocation-claim.v1", missionId, revisionId,
journalSequence }`. It is deliberately independent of decision and effect
identity, so concurrent requests for the same mission revision and sequence
contend for the same record ID before either can dispatch. Only the caller
whose newly appended record receives an exact verified receipt may call
`executeTool`; the API never returns a successful receipt for a pre-existing
record. A loser returns `invocation_claim_conflict` pre-dispatch.
The paired `execute` closure verifies the exact plan, decision, context, and
stored winning receipt by canonical equality, skips a second invocation
append, calls `executeTool`, and appends the deterministic
`audit-result:<decisionId>` result.
`replayRuntimeInvocationClaimsV1(...)` validates the runtime-specific record-ID
derivation and rejects a second runtime claim tuple as defense in depth.
Legacy `replayPermissionAuditLedger(...)`, per-decision invocation IDs, public
local-tool sessions, and multi-effect same-sequence behavior are unchanged.
Only the distinct `runtime-invocation:` namespace is interpreted as a runtime
claim; a legacy `audit-invocation:sha256:*` record remains legacy.
Raw or malformed audit arrays fail closed in either replay path.

The input deliberately has no caller-supplied cycle ID, effect key, or decision
ID. Let `B = expectedSequence`, the stable action-occurrence base. Create the
canonical closed identity object:

```ts
{
  contractVersion: 1,
  missionId,
  revisionId: expectedRevisionId,
  baseSequence: B,
  seatId,
  actionId,
  effectClass,
  validationId,
}
```

Using canonical JSON with sorted keys, derive three independent SHA-256
base64url digests by hashing a domain separator, one NUL byte, and that exact
JSON. The domains are `shield.runner-cycle.v1`, `shield.runner-effect.v1`, and
`shield.permission-decision.v1`. The final identifiers are respectively
`cycle:sha256:<digest>`, `effect:sha256:<digest>`, and
`decision:sha256:<digest>`. They are fixed length, injective up to SHA-256
collision resistance, unambiguous for colon-bearing fields, and valid under
both runner and permission-audit identifier limits.

After the journal is in `running` state at sequence `R`, the runner plan,
permission context, decision, and audit claim bind
`evaluatedThroughSequence: R`. The candidate binds
`expectedPreviousSequence: R` and `intendedJournalSequence: R + 1`.
`validationId` is therefore durably bound by every derived identity even
though legacy runner payload v1 remains byte-compatible. Replay recomputes the
identities from the request and exact-matches every payload field, including
seat, action, effect class, authorization decision, cycle, and effect key.

### Canonical schema-9 extension

Schema 9 keeps `replayProfileAwareMissionJournal(...)` and
`ProfileAwareProjectionV1` as its sole canonical replay/projection. The
projection gains `effects: RunnerExecutionEffectPayload[]`. Schema 9 accepts
one additive event, `execution.effect_recorded`, with the existing closed
runner execution payload. `createProfileAwareExecutionEffectEntryV1(...)` is
the only schema-9 effect-entry constructor. It requires authorization, frozen
profile gates, `execution === "running"`, current sequence/revision identity,
and no duplicate cycle ID or effect key. Replay preserves `running` for an
uncertain payload and moves execution to `completed` exactly for a completed
payload. Any replayed uncertain effect makes execute readiness `blocked`,
regardless of a later request's action or effect key. The constructor rejects
every further effect while any uncertain effect exists; recovery requires a
future explicit authorized contract and is outside this mission.

Runner inputs and candidates add schema 9 to their existing schema 5–8 union.
`PermissionInvocationContext.journalSchemaVersion` and
`validatePermissionInvocationContext(...)` add schema 9 to their existing
schema 6–8 union. Tests freeze both validators and the permission/runner
integration at schema 9.
Legacy schemas and `createExecutionEffectEntry(...)` are unchanged.

The schema-9 runner adapter is closed:

- `governanceState` is `approved` exactly when profile-aware authorization is
  `authorized`, otherwise `proposed`;
- `missionAuthorizationState` is the profile-aware `authorization`;
- `executionStatus` is the profile-aware `execution`;
- `executeReadiness` is `projection.readiness.execute`;
- `participantSeatIds` and `activatedModes` are copied from the frozen brief;
- `effectRecords` are constructed only from replayed
  `execution.effect_recorded` entries by adding their authoritative entry ID,
  mission ID, sequence, and timestamp to the validated payload.

No second governance source or caller-supplied runner projection exists.

### Ordered algorithm and sequences

Let `B` be `expectedSequence`.

1. Safely inspect the identity envelope. If mission, subject, revision, or
   sequence identity is absent, malformed, accessor-backed, proxy-backed, or
   otherwise unreadable, return the distinct identity-unbound `input_invalid`
   result below. Otherwise copy, validate, and recursively freeze the complete
   closed input and dependency references before the first await; later caller
   mutation cannot alter the cycle.
   Read and replay the exact journal. Reject a stale subject or revision first.
   Derive the stable identities from `B`. If the journal is unavailable,
   return the caller-bound `expectedSubjectId`; never fabricate identity.
2. Before stale-sequence rejection, inspect all replayed schema-9 effects. Any
   uncertain effect returns `uncertain` immediately, before authorization or
   dispatch, even when its key differs from the requested key. Otherwise,
   search for the derived effect key. An exact completed match returns
   `complete`; any same-key field mismatch is `effect_identity_mismatch`.
   This is the only successful stale-request replay path.
3. Require either `lastSequence === B`, or
   `lastSequence === B + 1` where entry `B + 1` is exactly the canonical
   `not-started → running` transition for this mission and revision. Any other
   state is `stale_sequence`.
4. Determine `R` as `B + 1` for that exact replayed transition and `B`
   otherwise. Replay the permission ledger and inspect the deterministic
   decision ID at `R`. A matching invocation without a result, a
   failed/uncertain result, or a completed result without the exact journal
   effect returns `uncertain`; no redispatch occurs. A conflicting claim at
   the same mission, revision, and `R`, including one with another decision
   ID, returns `blocked` before gates, append, authorization, or dispatch.
   Invalid audit state fails closed.
   For upgrade safety, the schema-9 composer treats every already replay-valid
   `tool.invocation` at the same mission, revision, and `R` as prior-dispatch
   evidence, including records written by implementation `586ca4` under
   `audit-invocation:sha256:*`. This conservative composer rule does not alter
   legacy replay APIs or reinterpret those records as new runtime claims.
5. If mission authorization or a frozen execution gate is pending, return
   `waiting` with the first pending requirement's `requiredRoleId`, in
   canonical requirement order; do not append, authorize, or dispatch. Mission
   authorization itself routes to Coulson. This is the current sequence-0
   outcome for `mission:issue-130-runtime-v2`.
6. If execution is `completed`, return `complete`. If execution is
   `not-started`, append one `execution.transition` at `B + 1`, re-read, and
   require canonical equality for that exact entry plus
   `execution === "running"` and `lastSequence === B + 1`; set `R = B + 1`.
   If execution is already `running`, retain `R = B`.
7. Build the sole schema-9 runner projection through the closed adapter.
   Acquire fresh permission context whose decision ID must equal the derived
   decision ID. Construct the authorizer and paired runtime claim/executor
   internally and call `runRunnerCycle(...)` once. The runner's claim phase is
   the atomic pre-dispatch boundary.
8. A pre-dispatch runner stop returns `waiting` or `blocked` without an effect
   append. A post-dispatch stop must carry an uncertain effect candidate.
9. Convert an advanced or uncertain candidate through
   `createProfileAwareExecutionEffectEntryV1(...)`, append it at `R + 1`, and
   never retry a `recovery_required` append.
10. Re-read and require:
   - `canonicalJson(entries[R + 1]) === canonicalJson(expectedEntry)`;
   - entry ID `entry:${missionId}:${R + 1}`;
   - exact mission, revision, cycle ID, effect key, authorization decision ID,
     seat, action, effect class, outcome, and sequence;
   - `projection.lastSequence === R + 1`;
   - exactly one matching effect with the recorded outcome; and
   - a changed journal digest.
11. Return `advanced` only after all readback invariants pass.

One invocation permits at most one pre-dispatch transition append and at most
one post-dispatch effect append. These are separate cardinality invariants;
the contract does not claim one total append. A transition append lock,
unavailable store, stale sequence, or readback failure is pre-dispatch and
`blocked`. After the invocation claim has been durably acquired, every
non-verified effect append outcome—including lock, unavailable store, stale
sequence, recovery required, and readback mismatch—is `uncertain`.
Thrown or malformed input, clock, read, append, permission, execution,
validation, and readback dependencies are converted to the same closed
pre-/post-claim outcomes; `runMissionCycle(...)` does not reject its promise
for host failures.

### Closed results and routing

```ts
type MissionCycleReasonCodeV1 =
  | "mission_authorization_required" | "gate_missing"
  | RunnerStopReason
  | "input_invalid" | "stale_subject" | "stale_revision" | "stale_sequence" | "duplicate_effect"
  | "effect_identity_mismatch" | "invocation_claim_conflict"
  | "invocation_claim_failed" | "invocation_claim_malformed"
  | "audit_invalid" | "audit_incomplete" | "audit_result_uncertain"
  | "journal_lock_held" | "journal_unavailable" | "recovery_required"
  | "transition_readback_mismatch" | "effect_readback_mismatch"
  | "complete";

type MissionCycleResultV1 =
  | {
      outcome: "blocked";
      missionId: null;
      subjectId: null;
      revisionId: null;
      sequence: null;
      accountableNextSeat: null;
      reasonCode: "input_invalid";
    }
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

- `waiting`, actual pending frozen-gate role:
  `mission_authorization_required` and `gate_missing`. Mission authorization
  routes to Coulson; execution gates route to their requirement's
  `requiredRoleId`.
- `waiting`, `coulson`: `authorization_wait`.
- `blocked`, requested `seatId`: `identity_mismatch`,
  `seat_not_participating`, `seat_not_executable`,
  `implementation_owner_mismatch`, `mode_context_mismatch`,
  `action_not_allowlisted`, `authorization_denied`, `authorization_failed`,
  `authorization_malformed`, and `authorization_stale`.
- `blocked`, `coulson`: `governance_not_approved`,
  `mission_not_authorized`, `execution_not_active`, `execute_not_ready`,
  `journal_sequence_mismatch`, `input_invalid`, `stale_subject`,
  `stale_revision`, `stale_sequence`,
  `duplicate_effect`, `effect_identity_mismatch`,
  `invocation_claim_conflict`, `invocation_claim_failed`,
  `invocation_claim_malformed`, `audit_invalid`, `journal_lock_held`,
  `journal_unavailable`, `transition_readback_mismatch`, and
  pre-dispatch `effect_readback_mismatch`.
- `uncertain`, `coulson`: `effect_outcome_uncertain`, `audit_incomplete`,
  `audit_result_uncertain`, `executor_failed`, `executor_uncertain`,
  `executor_malformed`, `executor_identity_mismatch`, `validator_failed`,
  `validator_malformed`, `validator_identity_mismatch`, and
  every post-dispatch `journal_lock_held`, `journal_unavailable`,
  `stale_sequence`, `recovery_required`, or `effect_readback_mismatch`.
- `complete`, `null`: replayed successful matching effect or completed
  execution.
- `advanced`, `hill`: successful effect append and exact readback.
- `effect_already_completed` is normalized to `complete`, never redispatched.

`standard@1` remains Coulson-only for execution and final acceptance. Fury and
Mack are process review/validation roles, not added gates. Fitz is introduced
only by a separately authorized stronger-profile successor.

Focused tests bind the final event/sequence model: current unauthorized
sequence-0 waiting/no-dispatch; transition at `B + 1`; effect at `R + 1`;
schema-9 permission and runner validation; closed schema-9 projection mapping;
completed and uncertain replay before stale rejection; stable identities
across transition/restart; validation-ID changes; delimiter-collision and
maximum-length identity inputs; exact and conflicting atomic invocation
claims, including concurrent calls with different decision IDs and proof that
exactly one `executeTool` call occurs;
legacy schema-6 multi-decision same-sequence permission sessions unchanged;
legacy `audit-invocation:sha256:*` records remaining legacy; malformed input
and throwing clocks; stale subject/revision/sequence; duplicate cycle/effect;
pre-dispatch append blocking;
exact `586ca4` claim-ledger upgrade replay without redispatch; missing identity
fields, hostile accessors/proxies, and concurrent caller mutation;
every post-dispatch append/readback failure becoming uncertain; exact
transition/effect readback; a different action/effect key after uncertainty
remaining blocked without dispatch; stronger-profile missing-gate routing to
Fitz or Simmons; every runner-stop mapping; unchanged schema 5–8 tests; package
export import; TypeScript consumer compile; and packed-tarball import. Issue
#76 remains out of scope.
