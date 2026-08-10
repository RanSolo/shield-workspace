# Issue #172 scope freeze

## Identity and base

- Mission: `mission:issue-172`
- Mission revision: `sha256:yK-21yxhTpN4QqDnKSQgYoDbf0g9vyEQ9M6cyQH2gpY`
- Subject: `github:RanSolo/shield-workspace/issue/172`
- Exact base: `1fbe2ef6eec79a3e4e677edae9b96bc3c27e65fa`
- Branch: `agent/issue-172-fury-review-evidence`
- Mode: Delivery
- Current authority: mission intake and planning/recon only
- Selected specialist runtimes: repository-local Daisy, May, and Mack; hosted Fury

## Objective

Deliver one independently reviewable pull request that persists Fury plan-review evidence with host-observed reviewer attribution and exact mission, plan, artifact, repository, runtime, and executor bindings, then admits a plan gate only when an exact candidate digest matches that durable evidence.

## Frozen boundaries

1. Extend the existing Fury plan-gate semantics; do not create a new review rubric, generic review service, or authority class.
2. Caller-provided packets or `--plan-gate` content cannot create, upgrade, or author Fury approval.
3. Durable evidence binds the exact mission, plan digest, blueprint artifact revision, repository revision, verdict, bounded findings, Fury seat, actual runtime/model, and actual tool executor.
4. Candidate acceptance requires exact digest comparison against independently stored evidence and fails closed for absent, stale, malformed, duplicate, conflicting, wrong-seat, or self-authored evidence.
5. Fury technical review remains non-authoritative and distinct from Coulson, Fitz, Simmons, publication, merge, deployment, and release authority.
6. Local Daisy, May, and Mack are execution choices for this mission only. This slice adds no local-model dispatch product behavior.
7. Do not absorb #170, #171 Slice C, #137, #29, GitHub review publication, or an external proving run.
8. No merge, deployment, release, migration, repair, destructive action, or external effect is included.
9. Preserve unrelated user changes by working only in the isolated worktree and exact branch above.

## Required planning outputs

1. Local Daisy identifies the exact current Fury plan-gate, durable-store, export, integration, and test seams using a bounded context packet.
2. Local May later produces one exact implementation blueprint from verified evidence after signed authorization, using the smallest packet that preserves quality.
3. Hosted Fury reviews the exact committed blueprint before implementation.
4. Implementation waits for explicit Wheels Up and stays inside Fury-approved paths.
5. Local Mack validates the exact implementation revision; hosted Fury then performs exact-revision conformance before Fitz human review.

## Stop condition

Stop at the implementation gate after hosted Fury approves the exact issue #172 blueprint. No production code changes are permitted during this planning mission phase.
