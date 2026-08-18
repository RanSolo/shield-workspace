# Issue #326 — Copilot empty-mode persistence and failed-dispatch recovery

## Exact planning identity

- Repository: `RanSolo/shield-workspace`
- Planning base: `e72fe678ca50826adba272971be6b7f02c7c77c8`
- Failed work receipt: `receipt:Y40rTRNdpEsqc9t24wRZ470R0zzYyk5G`
- Failed disposition: `COPILOT_EXECUTION_FAILED`
- Observed SDK error: `CopilotClient was created with mode: 'empty' but neither 'baseDirectory' nor 'sessionFs' was set. Empty mode requires an explicit per-session persistence location; pick one.`
- Pinned SDK: `@github/copilot-sdk@1.0.11`

This plan authorizes no implementation, model invocation, publication, merge, deployment, release, or human decision.

## Objective

Correct the production Fury dispatcher so its empty-mode Copilot client has a deterministic, host-owned persistence directory, structurally invalid SDK configuration fails before a packet claim, and the one known terminal failure above can resume through a deterministic successor that preserves and exact-binds the original receipt. The operator must be able to retry the unchanged governed request without rebuilding the reviewed plan, changing packet bytes or timestamps, editing journals/receipts, restarting intake, or entering another PIN.

## Frozen invariants

1. Empty mode, disabled configuration discovery, disabled skills/plugins/MCP, exact Git-tree tools, and all existing model/agent/tool observations remain unchanged.
2. No Copilot runtime process, model query, session, command, or external effect occurs before the durable execute-once claim.
3. Structural capability preflight occurs before claim and validates the exact client option shape required by SDK 1.0.11. A production-construction smoke test exercises the real pinned constructor without starting the runtime or contacting a model.
4. Persistence is mission/claim scoped, deterministic, and host owned under `.shield/runtime/copilot-fury/<claim-key>`. It is not derived from caller output paths. Every existing component must be a real directory; symlinks, aliases, non-directories, replacement, escape, insecure mode, and readback mismatch fail closed.
5. Persistence directories are materialized only after the caller wins the durable claim and immediately before client construction. Replays and concurrent losers do not create or mutate them.
6. Ordinary terminal `failed` receipts remain terminal. Recovery is allowed only for the exact SDK-configuration failure signature recorded above and only when all original request, packet digest, repository, mission, subject, plan, card, runtime, executor, and failed-evidence bindings replay exactly.
7. Recovery creates at most one deterministic successor receipt derived from the original receipt and a fixed recovery protocol identifier. The successor uses the unchanged canonical packet bytes and carries an input evidence reference that exact-binds the original receipt and its failed evidence digest. The original receipt and evidence remain immutable.
8. The recovery successor has its own execute-once claim. Concurrent recovery attempts produce one winner; exact retries replay the successor. No operator-controlled timestamp, packet mutation, or new authority is accepted as a recovery selector.
9. Any different failure code/message, malformed or missing failed evidence, ambiguous predecessor, changed packet, stale repository state, or conflicting successor fails closed and never invokes Copilot.
10. The successful recovery handoff returns the successor receipt ID while retaining the predecessor binding in durable evidence. Failure of the recovery attempt terminalizes only the successor and never rewrites the predecessor.

## Smallest implementation surface

### `packages/shield-team-system/src/copilot-fury-plan-dispatch-v1.mts`

- Derive and validate the deterministic persistence location from the already-derived claim identity.
- Extend executor preflight with the closed persistence/client-option projection, without constructing or starting the runtime.
- Materialize and verify the persistence directory after claim, then pass it as `baseDirectory` to `CopilotClient`.
- Recognize only the exact known failed predecessor and derive its deterministic recovery successor.
- Reuse the existing claim, execution, terminal evidence, final-readback, and replay machinery for the successor rather than creating a parallel effect path.
- Bind predecessor receipt/evidence into the successor claim and returned evidence.

### `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`

- Real pinned-SDK constructor smoke test: the exact empty-mode options construct successfully without `start`, `listModels`, session creation, or model contact.
- Structural preflight rejects absent, unsafe, substituted, or malformed persistence before claim.
- Persistence materialization occurs once, only for the claim winner, with confinement/symlink/mode/readback fault coverage.
- Exact known failed receipt recovers through one deterministic successor using unchanged packet bytes and no new human authority.
- Concurrent recovery invokes the runtime once; exact retry replays the successor.
- Different failure signatures, malformed predecessor evidence, stale bindings, and successor conflicts remain terminal/fail closed.
- Existing PASS, REVISE, interruption, terminal replay, tool confinement, replacement-ref, and startup-failure tests remain green.

No seat-dispatch lifecycle weakening or generic failed-receipt reopening is permitted. If implementation proves that a closed predecessor binding cannot be represented through existing started-receipt input evidence, stop and return to Fury rather than widening the generic receipt contract.

## Validation

Use Nx with cache enabled:

1. `npm exec -- nx run @shield/team-system:build`
2. `npm exec -- nx run @shield/team-system:test:copilot-fury-plan-dispatch`
3. `npm exec -- nx affected -t test --base=e72fe678ca50826adba272971be6b7f02c7c77c8 --head=HEAD`
4. `git diff --check e72fe678ca50826adba272971be6b7f02c7c77c8..HEAD`

Mack must distinguish cache hits from executed targets and bind evidence to the exact implementation HEAD. Fury must verify both architecture conformance and the exact recovery semantics before publication.

## Stop conditions

- Stop before implementation until Fury returns PASS on the exact plan revision.
- Stop for a human key turn before implementation.
- Stop if the generic seat-dispatch lifecycle must be weakened, the original receipt would be mutated, recovery requires new packet bytes/operator timestamps/new authority, or any pre-claim external effect is required.
- Stop before merge, deployment, release, or final acceptance.
