# Issue #173 scope freeze

## Identity and base

- Mission: `mission:issue-173`
- Mission revision: `sha256:0R-U1zLWj0QWhEa4NXeQ424Biahr5eiyJTHRqy04rrU`
- Subject: `github:RanSolo/shield-workspace/issue/173`
- Exact base: `107607c8d4f17b676c06561e51dbeba5b7a8ba12`
- Branch: `agent/issue-173-atomic-packet-claim`
- Mode: Delivery
- Current authority: mission intake and planning/recon only

## Objective

Deliver one independently reviewable pull request adding an atomic, durable packet-claim operation to the existing seat-dispatch store so the same governed packet cannot become a fresh executable effect after concurrency, restart, or post-start uncertainty.

## Frozen boundaries

1. Reuse the existing durable seat-dispatch receipt log, replay contract, and lock. Do not introduce a second ledger, scheduler, retry engine, queue, permission system, or runtime-binding source.
2. The claim boundary may authorize at most one caller to proceed to a separately governed execution step; it must not invoke a model or tool itself.
3. Packet identity is bound to canonical packet bytes and the exact mission/packet identity. A reused packet ID with different bytes fails closed.
4. A durable `dispatch.started` record precedes any executable result. Once start is durable or uncertain, restart cannot treat the packet as a fresh effect.
5. Exact duplicate readback is idempotent and non-executable; malformed, noncanonical, mixed-scope, conflicting, or path-unsafe ledger evidence fails closed.
6. Do not absorb #170, #171 Slice C, #172, #137, or #29.
7. No GitHub publication, merge, deployment, release, external proving run, migration, repair, or destructive action is included.
8. Preserve unrelated user changes by working only in the isolated worktree and exact branch above.

## Required planning outputs

1. Daisy identifies the exact existing lock, replay, receipt-identity, export, and test seams.
2. May produces one exact blueprint defining canonical packet bytes, deterministic identity derivation, claim result states, failure precedence, durability/readback semantics, smallest path set, and focused concurrency/recovery tests.
3. Fury reviews the exact committed blueprint before implementation.
4. Implementation waits for explicit Wheels Up and stays inside Fury-approved paths.
5. Mack validates the exact implementation revision; Fury then performs exact-revision conformance before Fitz human review.

## Stop condition

Stop at the implementation gate after Fury approves the exact issue #173 blueprint. No production code changes are permitted during this planning mission phase.
