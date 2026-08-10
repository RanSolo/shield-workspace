# Issue #206 — bounded multi-file governed May packets

## Mission binding

- Mission: `mission:issue-206`
- Mission revision: `sha256:Mc3GIfF4IIlgXq1vtHkvP_Imd9bk6lYNALgqFlPdMdA`
- Subject: `github:RanSolo/shield-workspace/issue/206`
- Planning base: `602b97c5253466d4936fc64817c06ece2769b2d2`
- Branch: `agent/issue-206-multi-file-dispatch`
- Mode: Delivery

## Problem

The issue #137 v5 proving mission reached literal Delivery Workspace
`dispatch_ready`, then the production governed dispatcher stopped before packet
claim with `runner_plan_invalid`. Its authority had generic rather than derived
effect keys, but correcting that manifest is insufficient: the dispatcher and
executor accept exactly one `writeFile` followed by one `runValidation`, while
the reviewed correction requires three exact file writes.

The existing contract hard-codes the pair in operation normalization,
authority projection, executor operation lookup, control-loop completion, and
governed audit/event readback. A validation command must never be used to
smuggle additional writes.

## Frozen design

### Operation sequence

`MayPlannedToolOperationsV1` becomes a bounded ordered tuple containing:

1. between one and three `writeFile` operations;
2. exactly one final `runValidation` operation.

The four-effect maximum plus one final no-tool response remains within the
existing eight-round and eight-call control-loop ceilings. Every
write path must be distinct. Normalization rejects sparse, proxy-backed,
accessor-backed, over-limit, duplicate-path, validation-first,
validation-middle, and multiple-validation sequences. The existing
one-write/one-validation packet remains valid with identical meaning.

No new tool name, capability, authority class, journal schema, receipt schema,
or runner cycle is introduced.

### Exact authority binding

Derive the signed authority expectation from the complete normalized sequence:

- relative paths are the exact distinct write paths;
- action IDs, effect classes, and capabilities remain the unique canonical
  write and validation values;
- effect keys are the outer mission-cycle effect key plus every operation
  effect key and, for multi-write packets only, one domain-separated packet
  sequence effect key derived from the full normalized operation digest;
- validation command IDs contain exactly the final validation command.

Set comparison remains canonical where the authority contract represents a
set. The multi-write sequence effect key binds order and every full
precondition, including `regularFileIdentity`, even though the existing
per-write effect key intentionally retains its legacy shape. The ordered
operation array, ordered operation-effect-key array, packet digest, dispatch
envelope, claim bytes, prompt, provenance, and terminal receipt evidence all
preserve that sequence binding. A legacy one-write packet receives no new key
and retains its current authority shape.

### Pre-effect order enforcement

The control loop must compare each proposed tool call with the normalized
operation at the current completed-call index before invoking the executor.
The comparison covers tool name and exact effect identity. An omitted,
duplicated, reordered, substituted, or extra operation fails before that
operation's effect.

The executor resolves the planned operation by its exact effect key rather
than by the current binary `write ? 0 : 1` lookup. Normalization guarantees one
matching planned effect key. Existing path, bytes, precondition, executable,
arguments, timeout, capability narrowing, revision freshness, and filesystem
confinement checks remain authoritative.

### Completion and durable recovery

Successful completion requires:

- exactly the planned number of calls;
- exactly the planned write count;
- one final validation;
- one ordered control event and one three-record permission-audit chain per
  operation;
- exact per-index action, effect class, effect key, capability, tool-call ID,
  and decision binding;
- the existing one completed outer mission-cycle effect and completed dispatch
  receipt.

The first failed or uncertain operation stops the remaining sequence. The
durable completed prefix contains only operations whose result audit record and
control event both read back successfully. If either post-effect record is
uncertain, the current operation is also uncertain and the durable packet claim
is the recovery anchor. A claimed partial packet remains nonterminal and every
later invocation fails closed to `recovery_required` before model or executor
invocation, with zero repeated effects. Automatic rollback is not added;
validation remains non-mutating and the existing recovery boundary remains in
force.

### Compatibility

- Keep `writeCalls`, `validationCalls`, and `completedToolCalls`; they already
  represent counts and need no public shape change.
- Keep the public `writeFile | runValidation` tool union unchanged.
- Keep one final validation command and one outer mission cycle.
- Preserve current single-write tests and behavior.

## Exact implementation scope

May may modify only:

1. `packages/shield-team-system/src/may-tool-effect-v1.mts`
2. `packages/shield-team-system/src/governed-may-dispatch-v1.mts`
3. `packages/shield-team-system/scripts/model/may-tool-executor.mjs`
4. `packages/shield-team-system/tests/may-tool-executor.test.mjs`
5. `packages/shield-team-system/tests/governed-may-dispatch-v1.test.mjs`

Planning artifacts are immutable during implementation.

## Required tests

- normalization accepts the legacy pair and a three-write maximum packet;
- malformed ordering, zero writes, four writes, duplicate paths, duplicate
  effect identities, and extra validations fail closed;
- executor/control loop completes three ordered writes then one validation;
- reordered, omitted, repeated, or substituted calls stop before the
  mismatched effect;
- a mid-sequence failure stops later calls and leaves only the proven durable
  completed-prefix evidence without a successful outer effect;
- governed authority binds every exact path, operation effect key, and the
  multi-write sequence effect key;
- reordered operations or a changed `regularFileIdentity` fail authority
  binding even when paths, content, and file digests otherwise match;
- preflight, Helicarrier envelope, claim, per-call permission narrowing,
  control events, audit records, journal effect, and terminal receipt read back
  exactly for a three-file disposable-repository integration;
- a second invocation replays a completed packet without repeating writes;
- a second invocation after mid-sequence failure or post-effect audit/control
  uncertainty returns recovery before model/executor invocation and repeats no
  effect;
- existing one-write composition and hostile-input suites remain passing.

## Validation

Run, without filtering failures:

```text
npm run build --workspace @shield/team-system
node --test packages/shield-team-system/tests/may-tool-executor.test.mjs
node --test packages/shield-team-system/tests/governed-may-dispatch-v1.test.mjs
npm test --workspace @shield/team-system
npm pack --workspace @shield/team-system --dry-run
git diff --check
```

## Stop conditions

Stop before effects on any stale repository/branch/HEAD, malformed operation
sequence, authority mismatch, Fury-evidence mismatch, runtime-binding mismatch,
preflight drift, extra path, validation mutation, claim ambiguity, or material
scope/risk change. Do not resume #137, run its external fixture, enter #29,
merge, deploy, or release.
