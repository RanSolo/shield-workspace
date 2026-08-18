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
3. Structural capability preflight occurs before claim and validates the exact client option shape required by SDK 1.0.11. The closed option projection includes `mode: "empty"`, an explicit `RuntimeConnection.forStdio()`, canonical `workingDirectory`, deterministic `baseDirectory`, and `logLevel: "none"`; it never permits the ambient `COPILOT_SDK_DEFAULT_CONNECTION` value to select transport. A production-construction smoke test exercises the real pinned constructor without starting the runtime or contacting a model, including hostile ambient connection values.
4. Persistence is mission/claim scoped, deterministic, and host owned under `.shield/runtime/copilot-fury/<claim-key>`. It is not derived from caller output paths. Preclaim validation derives the absolute path from the canonical repository root and validated claim key, inspects every existing prefix without mutation, and permits a nonexistent safe suffix. `.shield` must be a real directory owned by the effective UID and not group/other writable. After claim, `runtime`, `copilot-fury`, and the claim leaf are created component-by-component with mode `0700`; unsafe existing components are rejected, never repaired with `chmod`. Canonical path, type, owner, mode, device, and inode are snapshotted and revalidated immediately before client construction and immediately before `start`. Symlinks, aliases, non-directories, replacement, escape, insecure mode, and readback mismatch fail closed.
5. Persistence directories are materialized only after the caller wins the durable claim and immediately before client construction. Replays and concurrent losers do not create or mutate them.
6. Ordinary terminal `failed` receipts remain terminal. Recovery is allowed only for the exact SDK-configuration failure signature recorded above and only when all original request, packet digest, repository, mission, subject, plan, card, runtime, executor, and failed-evidence bindings replay exactly.
7. Recovery creates at most one deterministic successor receipt derived from the original receipt and a fixed recovery protocol identifier. Two closed projections remain distinct: (a) the canonical predecessor packet bytes are reconstructed from failed evidence, digest-checked, and passed unchanged to the successor claim; (b) a successor execution projection outside those packet bytes carries the successor `childSessionId`, deterministic `baseDirectory`, and explicit client options. Runtime observations must match the successor receipt's child session. The successor carries a non-reserved composite input-evidence binding to the original receipt, original terminal entry digest, failed-evidence digest, and original packet digest. The original receipt and evidence remain immutable.
8. The recovery successor has its own execute-once claim. Concurrent recovery attempts produce one winner; exact retries replay the successor. No operator-controlled timestamp, packet mutation, or new authority is accepted as a recovery selector.
9. Any different failure code/message, malformed or missing failed evidence, ambiguous predecessor, changed packet, stale repository state, or conflicting successor fails closed and never invokes Copilot.
10. Recovery writes a versioned successor evidence contract while preserving read compatibility for predecessor V1 evidence. It records the predecessor receipt ID, predecessor terminal entry digest, failed-evidence digest, original packet digest, and closed successor execution identity. The successful recovery handoff returns the successor receipt ID while retaining these predecessor bindings in durable evidence. Failure of the recovery attempt terminalizes only the successor and never rewrites the predecessor.

## Smallest implementation surface

### `packages/shield-team-system/src/copilot-fury-plan-dispatch-v1.mts`

- Derive and validate the deterministic persistence location from the already-derived claim identity.
- Extend executor preflight with the closed persistence/client-option projection and explicit stdio connection, without constructing or starting the runtime.
- Materialize and verify the persistence directory after claim, then pass it as `baseDirectory` to `CopilotClient`.
- Recognize only the exact known failed predecessor and derive its deterministic recovery successor.
- Reconstruct and digest-check the unchanged predecessor packet bytes for the successor claim while keeping successor session/persistence/client identity in a separate closed execution projection.
- Reuse the existing claim, execution, terminal evidence, final-readback, and replay machinery for the successor rather than creating a parallel effect path.
- Version successor evidence and bind predecessor receipt, terminal digest, failed evidence, and packet digest into the successor claim and returned evidence; continue to read V1 predecessor evidence.

### `packages/shield-team-system/tests/copilot-fury-plan-dispatch-v1.test.mjs`

- Real pinned-SDK constructor smoke test: the exact empty-mode, explicit-stdio options construct successfully without `start`, `listModels`, session creation, or model contact, even when `COPILOT_SDK_DEFAULT_CONNECTION` requests `inprocess` or contains an invalid value.
- Structural preflight rejects an absent/malformed option projection and unsafe or substituted existing persistence prefixes before claim; an absent safe filesystem leaf remains valid until the claim is won.
- Persistence materialization occurs once, only for the claim winner, with effective-UID ownership, group/other-write rejection, `0700` creation, confinement, symlink, inode/device replacement, mode, and readback fault coverage.
- Exact known failed receipt recovers through one deterministic successor using unchanged packet bytes and no new human authority.
- Successor runtime/session observations match the successor receipt rather than the predecessor packet's embedded session identity; V2 successor evidence exact-binds all predecessor identity digests while V1 predecessor evidence remains readable.
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
