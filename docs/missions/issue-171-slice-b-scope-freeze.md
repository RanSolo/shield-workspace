# Issue #171 Slice B scope freeze

## Identity and base

- Mission: `mission:issue-171-slice-b`
- Mission revision: `sha256:15OVRHWorBFCbQk8-2PjUwDjvpaFIYV4qSrRORjstn8`
- Subject: `github:RanSolo/shield-workspace/issue/171`
- Exact base: `081187204cf7ac3e57907a418a9e891119962740`
- Branch: `agent/issue-171-control-events`
- Mode: Delivery
- Current authority: mission intake and planning/recon only

## Objective

Deliver one independently reviewable pull request containing the durable filesystem-backed May control-event sink and exact readback boundary deferred from issue #171 Slice A.

## Frozen boundaries

1. May control events remain non-authoritative telemetry. They cannot create, infer, upgrade, or substitute mission authority, Wheels Up, runtime binding, executor identity, writable scope, validation commands, or human evidence.
2. Reuse the existing May control-loop event contract; do not introduce a second event taxonomy, dispatch store, permission system, or runtime-binding source.
3. Slice C remains blocked. Do not synthesize schema-v9 execution scope or active May runtime binding, and do not add host composition wiring that depends on them.
4. Do not absorb #170, #172, #173, #137, or #29.
5. No model invocation, governed dispatch, GitHub publication, merge, deployment, release, external proving run, migration, repair, scheduler, retry engine, or autonomous loop is included.
6. Missing, malformed, stale, conflicting, duplicated, noncanonical, path-unsafe, append-uncertain, or readback-mismatched evidence fails closed.
7. Preserve unrelated user changes by working only in the isolated worktree and exact branch above.

## Required planning outputs

1. Daisy identifies the exact existing control-event contract, current in-memory sink seams, analogous durable-store patterns, and unresolved provenance or replay questions.
2. May produces one exact non-authoritative blueprint with the smallest path set, closed API, durability/replay semantics, failure precedence, and focused test matrix.
3. Fury reviews the exact committed blueprint before implementation.
4. Implementation waits for explicit Wheels Up and stays inside Fury-approved paths.
5. Mack validates the exact implementation revision; Fury then performs exact-revision conformance before Fitz human review.

## Stop condition

Stop at the implementation gate after Fury approves the exact Slice B blueprint. No production code changes are permitted during this planning mission phase.
