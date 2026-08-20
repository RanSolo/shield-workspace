# Issue #346 — Reviewed-transition compositor plan

## Frozen identity

- Parent campaign: `#341`
- Issue: `#346`
- Repository: `RanSolo/shield-workspace`
- Branch: `agent/issue-346-reviewed-transition`
- Planning base and pre-plan HEAD: `42a5e47a0fb59544d775eb0b5b057d7c639773df`
- Subject: `github:RanSolo/shield-workspace/issue/346`
- Authority while planning: `none`

This repair composes two existing authority-none operations. It does not create
human, implementation, publication, merge, deployment, release, or final
acceptance authority.

## Problem

The production path has two complete but uncomposed halves:

1. `dispatchCopilotFuryPlanReviewV1` executes one governed Fury review and
   returns a durable PASS handoff containing the transition-plan path,
   structured review path, and dispatch receipt ID.
2. `materializeReviewedMissionTransitionV1` validates those three values
   against raw dispatch evidence and creates the protected reviewed-transition
   graph consumed by `prepareMissionTransitionSessionV1` and
   `shield mission prepare-next`.

Today Hill must author the dispatch request, parse the handoff, and copy its
three values into `mission record-reviewed-transition`. A hosted Fury response
cannot substitute for the production receipt. Missing graph evidence correctly
returns `protected_evidence_mismatch`, but the legal successor is not turnkey.

## Objective

Add one internal Team System host operation and one CLI command:

```text
shield mission prepare-reviewed-transition \
  --mission-id <id> \
  --transition-plan <committed-json-path> \
  --fury-model <model-id> \
  --root <explicit-root> \
  --json
```

The command derives the closed #319 request from canonical repository, mission,
prepared-worktree, plan, card, and runtime state; invokes the existing
execute-once dispatcher; and on canonical PASS feeds its exact handoff directly
through the existing #270 receipt resolver and materializer. It returns the
materializer result. `mission prepare-next` remains a separate graph consumer
and never invokes a model.

## Architecture and authority boundary

The new host is an authority-none compositor. It may:

- read canonical repository, prepared-worktree, mission, plan, and Fury-card
  state;
- persist/replay its own create-once request seed beneath the fixed SHIELD audit
  subtree;
- call the existing Fury dispatcher;
- pass a successful returned handoff to the existing resolver/materializer.

It may not accept a caller verdict, reviewer identity, receipt ID, output path,
tool/effect set, runtime/executor identity, workspace/session identity, request
timestamp, publication scope, or authority. It may not write the mission
journal, prompt for a PIN, implement, publish, merge, deploy, release, or mark
final acceptance.

The Fury model remains an explicit CLI argument because no current canonical
Copilot-host contract chooses it. The host validates the model identifier and
binds it into the stable request seed; it does not infer it from the Codex
`.codex/agents/fury.toml` adapter.

## Closed derivation

Before any dispatch claim or model invocation, derive and validate:

- exact canonical root, configured/remote repository identity, attached branch,
  exact HEAD, and planning-base ancestry;
- prepared-worktree receipt identity and safe regular SHIELD audit ancestors;
- canonical mission ID, mission revision, subject ID, journal sequence/digest,
  and current nonterminal state;
- committed exact-HEAD transition-plan path, raw SHA-256, closed V1/V2 contract,
  plan ID/digest, and exact mission/subject/repository/base/parent bindings;
- repository-default Fury card identity at exact HEAD;
- fixed #319 read-only tools, no effects, stop conditions, runtime, and executor;
- stable repository workspace ID derived from repository ID plus prepared lane
  identity, never the absolute path alone;
- stable parent-session ID derived from mission revision plus plan digest, never
  a live chat/thread ID.

Reject untracked, dirty, symlinked, hard-linked, non-regular, replaced,
cross-repository, wrong-branch, stale-HEAD, stale-journal, malformed, ambiguous,
or mismatched state before dispatch.

## Create-once request seed

Persist a closed request seed under a host-derived mission/plan-scoped location
inside `.shield/audit`. The seed contains only immutable logical request inputs
and one host-trusted timestamp selected on first creation. Use no-follow,
create-only, fsync, atomic install, exact readback, mode, inode, confinement,
and directory-sync rules consistent with existing SHIELD stores.

- Exact retry reuses byte-identical seed and timestamp.
- A different model, plan, mission, repository, card, runtime, executor, tool,
  effect, stop-condition, or workspace/session identity conflicts before model
  invocation.
- Missing after a durable dispatch claim, malformed bytes, replacement, partial
  write, or uncertain persistence returns recovery-required; never mint a new
  logical request around an existing claim.

## Dispatch and materialization sequence

1. Resolve or create the exact request seed.
2. Reobserve every mutable repository, mission, card, plan, and seed identity.
3. Invoke `dispatchCopilotFuryPlanReviewV1` with the derived request.
4. Preserve all dispatcher outcomes exactly:
   - PASS with complete handoff: continue;
   - REVISE, blocked, failed, cancelled, interrupted/recovery, conflict, or
     malformed: return it without graph creation.
5. On PASS only, resolve the returned dispatch receipt identity through the
   existing raw ledger path and call
   `materializeReviewedMissionTransitionV1` directly with the returned plan and
   review artifacts.
6. Return `materialized` or `already_materialized`. Do not reinterpret a
   materialization conflict or recovery state.

No output is copied through Hill or accepted back from the caller.

## Acceptance mapping

| Requirement | Evidence |
| --- | --- |
| Committed exact plan only | focused dirty/untracked/alias/replacement and binding tests |
| Canonical request derivation | exact request projection assertions from live fixture state |
| Stable identities | path-independent workspace and chat-independent session tests |
| Execute-once retry | byte-identical seed/request replay with one model invocation |
| Direct PASS handoff | real compositor-to-dispatcher-to-materializer integration test |
| Non-PASS preservation | exhaustive closed outcome table with absent graph |
| No caller evidence | unknown-field and attempted verdict/receipt/path injection tests |
| Prepare-next separation | package/CLI tests prove no compositor call from prepare-next |
| Cold Hill rail | packaged Hill/playbook tests require compositor before prepare-next |

## Bounded path set

Production:

- `packages/shield-team-system/src/copilot-fury-reviewed-transition-host-v1.mts`
- `packages/shield-team-system/src/mission-cli.mts`

Tests and operator rail:

- `packages/shield-team-system/tests/copilot-fury-reviewed-transition-host-v1.test.mjs`
- `packages/shield-team-system/tests/supervised-cli.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `packages/shield-team-system/agents/maria-hill-orchestrator.agent.md`
- `packages/shield-team-system/playbooks/delivery-mode.md`
- `packages/shield-team-system/tests/delivery-mode.test.mjs`
- this plan

No package export, package dependency, lockfile, `.codex` card,
`@shield/mission-preparation`, dispatch-receipt schema, #319 dispatcher contract,
reviewed-transition store, `prepare-next`, or authority-schema change is
authorized by this plan.

## Validation

Use Nx with normal cache behavior:

```text
npm exec -- nx run @shield/team-system:build
node --test packages/shield-team-system/tests/copilot-fury-reviewed-transition-host-v1.test.mjs
node --test --test-name-pattern='prepare-reviewed-transition|record-reviewed-transition' packages/shield-team-system/tests/supervised-cli.test.mjs
node --test packages/shield-team-system/tests/delivery-mode.test.mjs packages/shield-team-system/tests/package-surface.test.mjs
npm exec -- nx affected -t build test --base=42a5e47a0fb59544d775eb0b5b057d7c639773df --head=<exact-implementation-head> --nxBail
git diff --check 42a5e47a0fb59544d775eb0b5b057d7c639773df..<exact-implementation-head>
```

Mack independently validates the exact revision and cache provenance. Fury then
performs exact-revision conformance review.

## Stop conditions

Return to Fury before implementation if the repair requires:

- a new authority type or human gate;
- caller-supplied verdict, reviewer identity, receipt, output path, or request
  packet;
- a change to #319's dispatcher, #270's materializer/store, `prepare-next`,
  package exports, dependencies, or dispatch-receipt schemas;
- model inference from a different host adapter;
- arbitrary Markdown-to-scope compilation;
- publication, merge, deployment, release, destructive cleanup, or final
  acceptance.

## Proving disposition

After merge and SHIELD refresh, restart a genuinely cold Hill with the same
one-line Begin Mission instruction. Hill must replay the existing mission,
invoke this compositor automatically when the committed transition plan reaches
Fury review, continue through `mission prepare-next`, and surface only the next
genuine human key turn. Record the first new rail edge on #341 and repeat.
