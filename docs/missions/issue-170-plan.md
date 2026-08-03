# Issue #170 — exact governed May dispatch plan

## Gate identity

- Mission: `mission:issue-170`
- Authorized mission revision: `sha256:qlJv8-RdF7lYLTZx09nQQ485jrtLzjF0a4LVWw9mujY`
- Base revision: `f05b92f4f4ad7535d60289a5d2cde2493fbfd820`
- Branch: `agent/issue-170`
- Scope: issue #170 only
- Status: Fury passed the corrected plan, then implementation exposed one
  restart-attribution gap at exact head `4370004ecc7d5406367a9558acdb363dee8828c9`.
  This amendment incorporates Fury's narrow read-only ledger correction.

## Fury reconciliation

1. Add the missing atomic schema-9 append/readback API to `mission-store.mts`;
   the coordinator does not implement its own journal locking.
2. Derive packet/session identity from durable evidence and the pinned original
   sequence; callers cannot vary it, and replay resolves receipts first.
3. Represent uncertainty as a nonterminal started/interrupted receipt plus
   `recovery_required`, never as a fabricated terminal.
4. Repeat the exact evidence/live-state checks inside `executeTool` immediately
   before `runMayControlLoop`.
5. Make `readiness` mandatory in every discriminated result and reserve literal
   `dispatch_ready` for results that prove the gate was crossed.

## Frozen objective

Add one canonical host-neutral public function for exactly one governed May
dispatch step. It consumes durable schema-9 mission authority, active runtime
binding, exact Fury plan-review evidence, live workspace state, and bounded
untrusted work intent; emits literal `dispatch_ready` only for an exact current
tuple; durably claims at most one packet; executes through the existing
Helicarrier, mission runtime, permission, and May control-loop boundaries; and
records a closed terminal or recovery-required outcome.

## Public boundary

Add `runGovernedMayDispatchStepV1(...)` under a new documented package subpath
`@shield/team-system/governed-may-dispatch`.

The public input is closed and contains only:

- repository root and configured schema-9 journal path;
- mission ID;
- host ID.

The caller does not supply a packet ID, session ID, blueprint path, requested
paths, validation commands, output contract, runtime/model/executor identity,
absolute path, executable/argv value, PR identity, capability, or human
decision. The unique current durable Fury record selects the blueprint. The
tracked blueprint is immutable untrusted work intent; replayed implementation
authority defines its maximum scope. The coordinator validates a closed derived
dispatch envelope/IR whose paths, validation IDs, output contract, and fixed
`after_one_cycle` stop condition are checked against that authority before
Helicarrier. The certified manifest then binds only the compilation digests and
byte lengths it actually contains. Missing or ambiguous current blueprint
evidence blocks.

Trusted host dependencies are supplied separately and snapshotted before the
first await. They provide read-only workspace observation, schema-9 host probes,
certified Helicarrier validation/compilation, fixed validation-command records,
the loopback May model adapter, clocks, and existing durable store operations.
They are capabilities, not caller evidence. Missing or malformed capabilities
fail closed.

## Derived dispatch envelope

The coordinator constructs one canonical immutable envelope. Every authoritative
field is derived from replayed or host-observed evidence:

- mission, subject, mission revision, and journal sequence;
- repository, canonical root, base/head revision, branch, and PR number;
- Fury evidence ID/digest, plan digest, blueprint identity/path/revision, and
  attributed Fury runtime/executor identity;
- May seat, active runtime/model, tool executor, implementation authority ref,
  binding ID/version, approved paths, actions, effect classes/keys,
  capabilities, and validation command IDs;
- Helicarrier-manifest requested subsets and output contract, plus the fixed
  one-cycle stop condition.

Canonical bytes of that derived envelope—not caller object identity—are passed
to `claimSeatDispatchPacketV1`. Reuse its existing packet digest and deterministic
receipt identities; do not add a second claim-key algorithm. Derive only
`parentSessionId` and `packetId` from the durable mission revision, Fury-bound
blueprint identity/digest, and the original expected cycle sequence. Consume
`receiptId`, `dispatchId`, `childTaskId`, and `childSessionId` only from the
validated `claimSeatDispatchPacketV1` result. Preserve the original sequence in
exact dispatch input evidence so a later journal sequence cannot create a fresh
packet.

## Exact sequence

1. Snapshot and validate the closed input and trusted dependency functions.
   Reject proxies, accessors, symbol keys, sparse arrays, unsafe paths, and
   unknown fields before any write.
2. Read/replay the schema-9 journal and bind the durable mission, subject, and
   mission revision without assuming the current sequence is the original
   dispatch sequence.
3. Read/replay the durable Fury evidence ledger and the validated canonical raw
   dispatch receipt ledger through `readSeatDispatchReceiptLedgerV1` before
   current-head evaluation. Resolve a unique receipt for this mission revision
   and Fury-bound blueprint identity. Recover its pinned original cycle sequence
   plus the caller-independent parent/packet identities from validated input
   evidence; consume child/receipt/dispatch identities from the replayed store
   projection:
   - an exact terminal returns `replayed` without Helicarrier, model, validation,
     or tool execution;
   - a start/interruption without exact terminal returns `recovery_required`;
   - multiple, malformed, or conflicting matches return `recovery_required`;
   - only no matching receipt proceeds toward a fresh dispatch.
4. For a fresh dispatch, require the current journal sequence, running or
   startable execution, active Wheels Up authority, and exactly one active May
   runtime binding. Pin that current pre-transition sequence as the original
   expected cycle sequence.
5. Evaluate the unique current Fury candidate through
   `evaluateFuryPlanReviewEvidenceV1`. Require attributed `eligible` evidence
   for the current blueprint and current repository revision.
6. Read the current delivery-workspace state through a trusted read-only host
   dependency. Require one open matching PR, exact repository/base/branch/PR
   identity, and exact head equal to Fury evidence, implementation authority,
   runtime binding, and live Git HEAD. Do not call the effectful workspace
   publication helper.
7. Read the Fury-selected blueprint bytes from the exact tracked Git revision,
   not the mutable worktree or caller bytes. Treat Markdown/prose as immutable
   untrusted work intent; do not parse prose into authority or executable data.
8. Derive only `parentSessionId` and `packetId` from the mission revision,
   Fury-bound blueprint identity/digest, and pinned original cycle sequence.
   Invoke `runHelicarrierV0` with the blueprint bytes, replay-derived trust
   envelope, and snapshotted certified host compiler/validator dependencies.
   Before that call, validate and snapshot the closed derived dispatch
   envelope/IR: requested paths, actions, effects, capabilities, and validation
   IDs must be subsets of active implementation authority; require the exact
   output contract and `after_one_cycle`; resolve command IDs only through the
   snapshotted host-owned registry; executable/argv fields and unknown fields
   are forbidden. Pass that exact snapshot through Helicarrier. Require exact
   nested certification identity and retain its prompt/provenance/manifest
   digests in dispatch evidence. Parse returned `compilation-manifest.v0` only
   according to its real frozen schema and verify its IR, governance, registry,
   prompt, provenance, renderer, target, and byte-length bindings. Do not treat
   the manifest as carrying authority subsets. A validation, compilation,
   manifest, or subset failure is pre-effect and blocked.
9. Load a fresh permission context through
   `loadSchema9PermissionContextV1`. Require all packet and May-control
   capabilities and exact root/branch/HEAD. Check that dirty paths are empty or
   entirely within the replay-authorized relative path set.
10. Only after steps 1-9 succeed produce the exact internal readiness value
   `dispatch_ready`. Every public result after this gate has mandatory
   `readiness: "dispatch_ready"`; blocked results have mandatory
   `readiness: "blocked"` and cannot contain the literal `dispatch_ready`.
11. Call `claimSeatDispatchPacketV1` with the canonical derived envelope bytes.
   Its durable append, sync, lock release, and exact readback are the outer
   packet linearization point.
   - `claimed/execute_once`: continue.
   - exact prior terminal receipt: return the replayed terminal result without
     model or tool invocation.
   - `already_claimed` without an exact terminal: return
     `recovery_required`; never invoke again.
   - conflict, malformed log, lock uncertainty, or release uncertainty: return
     `recovery_required` or the exact closed pre-effect blocker.
12. After claim, reread workspace state,
    Fury evidence/receipt attribution, schema-9 journal, live root/branch/HEAD,
    dirty paths, and permission context. Any drift appends a deterministic
    failed dispatch terminal when safely possible; inability to prove that
    terminal yields `recovery_required`. No model/tool effect occurs.
13. Call existing `runMissionCycle` once. Its dependencies are composed as
    follows:
    - `readMissionJournalForDisplay` plus the new production
      `appendProfileAwareMissionEntryV1` adapter described below;
    - `createPermissionAuditFilesystemStore`;
    - `loadSchema9PermissionContextV1` for authorization, runtime claim, and
      execution-time fresh contexts;
    - one `executeTool` callback that invokes `runMayControlLoop` with the
      Helicarrier-produced prompt and authority-derived runtime/model/root/files/
      validation registry;
    - `createMayControlEventFilesystemStore` for exact control-event append and
      readback;
    - the closed required-capability set and result validator.
14. The `executeTool` wrapper repeats the exact durable Fury evidence and
    attribution read, read-only PR observation, schema-9 journal replay, live
    root/branch/HEAD, dirty-path, authority/binding, and permission-context
    checks immediately before invoking `runMayControlLoop`. Drift returns a
    failed runner executor result with no model/tool call. This is the final
    model-effect boundary; the earlier post-claim check does not substitute for
    it.
15. `runMissionCycle` remains the owner of permission decision evidence,
    runtime invocation claim, per-call fresh permission, validated runner
    outcome, and authoritative mission effect append/readback. The coordinator
    must not duplicate or weaken those contracts.
16. Append the matching dispatch terminal receipt only after the mission-cycle
    outcome and required control/audit/journal readbacks are exact:
    - completed for a validated advanced cycle;
    - failed only when the host can prove no uncertain effect remains;
    - interrupted/cancelled only for existing legal lifecycle conditions.

    The receipt contract has no uncertain terminal. If an effect or durable
    write cannot be classified exactly, leave the receipt durably started (or
    append `dispatch.interrupted` only when that legal transition is itself
    exact) and return `recovery_required`. Do not fabricate a terminal state.
17. Reread dispatch, permission-audit, May-control, and mission journals before
    returning. Completed, failed, and replayed results require exact identity,
    one legal terminal, runtime/model/executor attribution, and matching
    evidence references. `recovery_required` instead requires the strongest
    available exact readback of the started or interrupted nonterminal state;
    absence, conflict, or malformed readback remains recovery-required and is
    never represented as terminal.

## Closed result taxonomy and precedence

The exact discriminated public result is:

- `{ state: "blocked", readiness: "blocked", code, errors }`: no packet claim
  and no model/tool effect;
- `{ state: "completed", readiness: "dispatch_ready", ...evidence }`: one exact packet was claimed,
  one cycle advanced, and all terminal readbacks match;
- `{ state: "failed", readiness: "dispatch_ready", ...evidence }`: a claimed
  packet reached a provably effect-safe terminal failure;
- `{ state: "replayed", readiness: "dispatch_ready", ...evidence }`: an exact
  prior completed/failed/cancelled terminal was returned without execution;
- `{ state: "recovery_required", readiness: "dispatch_ready", code, errors,
  ...knownEvidence }`: the exact gate was crossed, but a start/claim/effect/write
  may exist and a unique safe terminal cannot be proven;
- `{ state: "recovery_required", readiness: "indeterminate", code, errors,
  ...knownEvidence }`: malformed, conflicting, or uncertain durable evidence
  prevents proving whether the gate was crossed. This result cannot authorize
  execution.

Pre-claim blockers use this order:

1. malformed/unsafe input or missing trusted host capability;
2. unsupported, missing, malformed, mixed, or replay-invalid journal;
3. mission/subject/revision/sequence/execution mismatch;
4. missing, inactive, stale, or conflicting implementation authority/binding;
5. missing, malformed, conflicting, stale, unattributed, or ineligible Fury
   evidence;
6. workspace repository/base/branch/PR/head mismatch;
7. packet/path/validation/output/stop-condition scope mismatch;
8. Helicarrier validation, certification, or compilation failure;
9. live root/branch/HEAD/dirty-path/writability/capability failure;
10. dispatch receipt conflict or recovery-required state.

After a durable claim, uncertainty overrides ordinary failure. No later error
may be reported as a clean pre-effect block, and no uncertain state is described
as a terminal dispatch receipt.

## Replay and concurrency rules

- One canonical packet identity may produce `execute_once` only once.
- Same packet ID with different canonical bytes is a hard conflict.
- A durable start without exact terminal evidence never becomes a fresh effect
  after restart.
- An exact completed/failed terminal is returned as replay evidence and does
  not rerun Helicarrier, model, validation, or tool effects.
- Runtime invocation claims and mission effect keys continue to enforce their
  own independent at-most-once boundaries.
- Cross-store operations are not represented as atomic. Any inability to prove
  their ordered readbacks returns `recovery_required`.

## Bounded implementation paths

- Add `packages/shield-team-system/src/governed-may-dispatch-v1.mts`.
- Add `packages/shield-team-system/tests/governed-may-dispatch-v1.test.mjs`.
- Update `packages/shield-team-system/src/mission-store.mts` with one atomic
  `appendProfileAwareMissionEntryV1` API. It must lock, replay the current
  schema-9 journal, require the exact next sequence, validate the candidate via
  `replayProfileAwareMissionJournal`, append and fsync one canonical line,
  durably sync a newly created parent/log, reread exact bytes and projection,
  and report lock-release or durability uncertainty as `recovery_required`.
  It must reject legacy/mixed journals and must not modify the existing legacy
  append contract.
- Update `packages/shield-team-system/src/seat-dispatch-store.mts` with one
  read-only `readSeatDispatchReceiptLedgerV1(scope)` API that exposes the
  already validated canonical `entries` and `projections` returned by the
  private store replay. Export it through
  `packages/shield-team-system/src/dispatch-receipts.mts`. This is the sole
  exception to the receipt-store reuse-only boundary and grants no write,
  claim, attribution, or execution authority.
- Update `packages/shield-team-system/tests/seat-dispatch-store.test.mjs` with
  focused restart, malformed-log, mixed-scope, unsafe-path, and raw-ledger Fury
  attribution coverage.
- Update `packages/shield-team-system/tests/mission-store.test.mjs` with focused
  schema-9 append, concurrency, stale sequence, unsafe path, short write/sync,
  exact readback, and uncertain lock-release coverage.
- Update `packages/shield-team-system/package.json` for one explicit export.
- Update `packages/shield-team-system/tests/package-surface.test.mjs`.
- Update `packages/shield-team-system/PUBLIC_API.md`.
- Add only this mission brief, recon, and plan under `docs/missions/`.

Existing authority, Fury evidence, permission, runner, May-control,
Helicarrier, local-tool, and GitHub modules are reuse-only. The schema-9
mission-store append and read-only raw dispatch-ledger reader are the only
prerequisite primitives included because Fury found both absent. No other
existing contract may be changed without a concrete Fury finding showing that
composition is otherwise impossible.

## Focused acceptance tests

- exact success crosses literal `dispatch_ready`, claims once, invokes one May
  packet, records control/audit/journal/dispatch evidence, and stops at Hill;
- every preflight class above blocks before model/tool invocation;
- stale Fury review, wrong/unattributed Fury receipt, PR-head drift, branch/HEAD
  drift, absent runtime binding, revoked authority, dirty out-of-scope path,
  requested path escape, and validation command injection fail closed;
- concurrent identical claims allow one executor; changed bytes conflict;
- restart after completed/failed terminal replays without effects;
- restart after start without terminal returns `recovery_required`;
- caller variation cannot change packet/session identity; replay after the
  mission sequence advances resolves the original receipt before Helicarrier;
- schema-9 append is atomic, exact-readback verified, sequence-checked, and
  fail-closed for mixed/legacy journals and lock/durability uncertainty;
- permission denial, model failure, tool failure, audit failure, control-event
  failure, dispatch-terminal failure, and mission-journal failure preserve the
  blocked/failed/uncertain distinction;
- authority/Fury/workspace/HEAD drift between initial readiness and post-claim
  revalidation prevents model invocation;
- actual seat, model/runtime, tool executor, repository, revisions, PR,
  blueprint, paths, commands, effect keys, and evidence refs remain exact;
- no merge, deployment, release, GitHub mutation, scheduler, daemon, autonomous
  second cycle, external #137 run, or #29 behavior is reachable.

## #137 proving disposition

Because PR #168 is already merged, the former criterion “advance #137 / PR
#168” is stale and cannot be claimed. After implementation validation, a
separately authorized proving invocation may run the historical approved
three-path #137 packet in a disposable local checkout, using current schema-9
authority and the new coordinator, then stop at its post-implementation review
gate. That proof may demonstrate runtime participation; it does not mutate PR
#168, complete #137's fresh external run, or enter #29.

## Validation commands

```bash
npm run build --workspace packages/shield-team-system
node --test packages/shield-team-system/tests/governed-may-dispatch-v1.test.mjs
node --test packages/shield-team-system/tests/mission-store.test.mjs
node --test packages/shield-team-system/tests/schema9-permission-context-v1.test.mjs
node --test packages/shield-team-system/tests/fury-plan-review-evidence-store.test.mjs
node --test packages/shield-team-system/tests/seat-dispatch-store.test.mjs
node --test packages/shield-team-system/tests/permission-v1.test.mjs
node --test packages/shield-team-system/tests/mission-runtime-v1.test.mjs
node --test packages/shield-team-system/tests/may-control-event-store.test.mjs
node --test packages/shield-team-system/tests/may-tool-executor.test.mjs
node --test packages/shield-team-system/tests/helicarrier-v0.test.mjs
node --test packages/shield-team-system/tests/package-surface.test.mjs
node --test --test-concurrency=1 packages/shield-team-system/tests/*.test.mjs
```

## Explicit stop

Stop when one PR is ready for human review after Mack exact-revision validation
and Fury conformance review. Do not merge, deploy, release, perform an external
#137 run, enter #29, or implement #167/#169.
