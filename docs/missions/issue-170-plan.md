# Issue #170 — exact governed May dispatch plan

## Gate identity

- Mission: `mission:issue-170`
- Authorized mission revision: `sha256:qlJv8-RdF7lYLTZx09nQQ485jrtLzjF0a4LVWw9mujY`
- Base revision: `f05b92f4f4ad7535d60289a5d2cde2493fbfd820`
- Branch: `agent/issue-170`
- Scope: issue #170 only
- Status: awaiting exact-revision Fury review; implementation has not started

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
- one bounded work-intent packet reference;
- host ID and lock-owner/session identity needed for durable stores.

The work-intent packet may request an objective, a subset of relative paths,
validation command IDs, an output contract, and the fixed `after_one_cycle`
stop condition. It cannot contain authority, runtime/model/executor identity,
absolute paths, executable/argv values, PR authority, capabilities, or human
decisions.

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
- requested subsets, output contract, and one-cycle stop condition.

Canonical bytes of that derived envelope—not caller object identity—are passed
to `claimSeatDispatchPacketV1`. Reuse its existing packet digest and deterministic
receipt identities; do not add a second claim-key algorithm.

## Exact sequence

1. Snapshot and validate the closed input, work-intent bytes, and trusted
   dependency functions. Reject proxies, accessors, symbol keys, sparse arrays,
   unsafe paths, mutable byte aliases, and unknown fields before any write.
2. Read/replay the schema-9 journal. Require exact mission/subject/current
   sequence, running or startable execution, active Wheels Up authority, and
   exactly one active May runtime binding.
3. Read/replay the durable Fury evidence ledger and Fury dispatch receipt log.
   Evaluate the exact candidate through `evaluateFuryPlanReviewEvidenceV1`.
   Require attributed `eligible` evidence for the current blueprint and current
   repository revision.
4. Read the current delivery-workspace state through a trusted read-only host
   dependency. Require one open matching PR, exact repository/base/branch/PR
   identity, and exact head equal to Fury evidence, implementation authority,
   runtime binding, and live Git HEAD. Do not call the effectful workspace
   publication helper.
5. Resolve the work-intent path and requested files/validation IDs only as
   subsets of the active implementation authority. Resolve command IDs through
   the snapshotted host-owned registry; packet text never supplies executable
   paths or argv.
6. Invoke `runHelicarrierV0` with the derived envelope and snapshotted certified
   host compiler/validator dependencies. Require exact nested certification
   identity and retain its prompt/provenance/manifest digests in the dispatch
   evidence. A compilation failure is pre-effect and blocked.
7. Load a fresh permission context through
   `loadSchema9PermissionContextV1`. Require all packet and May-control
   capabilities and exact root/branch/HEAD. Check that dirty paths are empty or
   entirely within the replay-authorized relative path set.
8. Only after steps 1-7 succeed set the internal readiness value to literal
   `dispatch_ready`. Blocked calls never include that literal. A terminal result
   may report `readiness: "dispatch_ready"` to prove the gate was crossed.
9. Call `claimSeatDispatchPacketV1` with the canonical derived envelope bytes.
   Its durable append, sync, lock release, and exact readback are the outer
   packet linearization point.
   - `claimed/execute_once`: continue.
   - exact prior terminal receipt: return the replayed terminal result without
     model or tool invocation.
   - `already_claimed` without an exact terminal: return
     `recovery_required`; never invoke again.
   - conflict, malformed log, lock uncertainty, or release uncertainty: return
     `recovery_required` or the exact closed pre-effect blocker.
10. After claim and immediately before model invocation, reread workspace state,
    Fury evidence/receipt attribution, schema-9 journal, live root/branch/HEAD,
    dirty paths, and permission context. Any drift appends a deterministic
    failed dispatch terminal when safely possible; uncertain terminal append
    yields `recovery_required`. No model/tool effect occurs.
11. Call existing `runMissionCycle` once. Its dependencies are composed as
    follows:
    - durable profile-aware journal read/append adapters;
    - `createPermissionAuditFilesystemStore`;
    - `loadSchema9PermissionContextV1` for authorization, runtime claim, and
      execution-time fresh contexts;
    - one `executeTool` callback that invokes `runMayControlLoop` with the
      Helicarrier-produced prompt and authority-derived runtime/model/root/files/
      validation registry;
    - `createMayControlEventFilesystemStore` for exact control-event append and
      readback;
    - the closed required-capability set and result validator.
12. `runMissionCycle` remains the owner of permission decision evidence,
    runtime invocation claim, per-call fresh permission, validated runner
    outcome, and authoritative mission effect append/readback. The coordinator
    must not duplicate or weaken those contracts.
13. Append the matching dispatch terminal receipt only after the mission-cycle
    outcome and required control/audit/journal readbacks are exact:
    - completed for a validated advanced cycle;
    - failed only when the host can prove no uncertain effect remains;
    - interrupted/cancelled only for existing legal lifecycle conditions;
    - uncertain/recovery-required when any post-claim effect or durable write
      cannot be classified exactly.
14. Reread dispatch, permission-audit, May-control, and mission journals and
    require exact identity, single terminal, runtime/model/executor attribution,
    and matching evidence references before returning.

## Closed result taxonomy and precedence

The function returns one of:

- `blocked`: no packet claim and no model/tool effect;
- `completed`: readiness was `dispatch_ready`, one exact packet was claimed,
  one cycle advanced, and all terminal readbacks match;
- `failed`: a claimed packet reached a provably effect-safe terminal failure;
- `replayed`: an exact prior terminal was returned without execution;
- `recovery_required`: a start/claim/effect/write may exist but a unique safe
  terminal cannot be proven.

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
may be reported as a clean pre-effect block.

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
- Update `packages/shield-team-system/package.json` for one explicit export.
- Update `packages/shield-team-system/tests/package-surface.test.mjs`.
- Update `packages/shield-team-system/PUBLIC_API.md`.
- Add only this mission brief, recon, and plan under `docs/missions/`.

Existing authority, Fury evidence, permission, runner, dispatch-store,
May-control, Helicarrier, local-tool, GitHub, and journal modules are reuse-only.
Edits to them require a concrete Fury finding showing that composition is
otherwise impossible.

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

