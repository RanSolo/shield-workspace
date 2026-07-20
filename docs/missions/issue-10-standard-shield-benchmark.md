# Mission Brief: Issue #10 Standard S.H.I.E.L.D. Benchmark

- **Canonical issue:** `RanSolo/shield-workspace#10`
- **Benchmark:** 2 — Standard sequential S.H.I.E.L.D. Delivery
- **Control:** PR #52 — Codex Parallel; preserve unchanged
- **Base revision:** `abb2beea7883ef5b506cc8e5a1f17831889818ba`
- **Wheels Up:** Phil Coulson, 2026-07-20
- **Benchmark clock:** 2026-07-20T01:55:04Z
- **Implementation authorization:** 2026-07-20T02:08:04Z
- **Owner:** Maria Hill

## Objective

Reimplement Issue #10 from `main` with the same architecture and acceptance
boundary as Benchmark 1, using the sequential S.H.I.E.L.D. workflow. Optimize
for a small reviewable PR, clear ownership, low coordination overhead, and
governed delivery—not maximum parallelism.

## Sequential workflow

Only one seat is active at a time:

1. Daisy performs reconnaissance.
2. Hill freezes the implementation plan.
3. Coulson authorizes implementation.
4. May owns the complete implementation and focused validation.
5. Hill integrates once and runs repository validation.
6. Frontier Fury performs one exact-head architecture review.
7. May addresses only required blockers, if any.
8. Frontier Fury returns one final PASS/FAIL when corrections were required.
9. Fitz receives the ready PR for human technical review.

No disposable implementation agents, parallel workers, or speculative review
loops are authorized.

## Daisy evidence and Hill reconciliation

Daisy confirmed the exact Issue #8 seam: `runRunnerCycle` calls the injected
`authorize(plan)` once after closed projection checks and immediately before
the executor. The runner already prevents non-allow, malformed, thrown, and
stale decisions from reaching the executor and preserves the opaque JSON
authorization artifact.

Daisy proposed keeping runtime bindings only in that artifact. Hill rejects
that recommendation because it conflicts with the frozen architecture. The
artifact transports evidence to the executor; it is not authoritative mission
state. Mission approval also cannot substitute for separate binding or
substitution authorization.

## Frozen architecture

### Three identities

- `seatId` identifies responsibility and authority.
- `reasoningRuntimeId` identifies the runtime performing reasoning.
- `toolExecutorId` identifies the runtime or host invoking the tool.

Runtimes and executors are not seats and inherit no seat authority. Coulson,
Fitz, and Simmons remain human-only and cannot receive runtime bindings.

### Authoritative binding state

Add a homogeneous supervised journal v6 with:

- `runtime.binding_recorded` for an initial active binding; and
- `runtime.binding_superseded` for an atomic replacement.

Each event requires separate signed Coulson evidence over the exact binding,
prior binding identity, mission/subject, revisions, and next sequence. Replay
derives active binding state. Journal v2-v5 behavior remains unchanged.

### Per-call permission

At the Issue #8 seam, a pure deny-by-default evaluator exact-matches:

- mission, subject, authorized seat, and current journal sequence;
- reasoning runtime and tool executor;
- binding ID/version;
- repository, canonical writable root, branch, mission revision, and artifact
  revision;
- action, effect class/key, approved scope, and required capabilities; and
- fresh host-observed capability, repository-root, and writability
  attestations.

Attestations prove operational capability only. Issue #34 owns producing real
probes and broker behavior.

### Audit boundary

Permission decisions and tool results use a separate closed append-only ledger
with truthful seat/runtime/executor attribution. A matching atomic
append-if-absent receipt is required before `allow` returns. The ledger is
non-authoritative and cannot grant permission or modify journal, governance, or
readiness state. Result-audit failure becomes uncertain; secrets, private
reasoning, and raw output bodies are excluded.

## Minimal implementation scope

- `src/mission-v2.mts` — journal v6 binding events, signed authorization,
  replay projection, and v5 compatibility
- `src/runner-v1.mts` — minimal v5/v6 compatibility only
- `src/permission-v1.mts` — closed bindings/attestations/artifact, evaluator,
  #8 authorizer, and executor preflight wrapper
- `src/permission-audit-v1.mts` — closed records, digest/receipt validation,
  and non-authoritative replay
- focused tests for journal lifecycle, evaluator/audit contracts, runner
  integration, and package exports
- one focused permission-boundary document plus necessary public API updates

## Acceptance criteria

- Every actual tool invocation requires one fresh exact permission decision.
- Missing, malformed, stale, ambiguous, substituted, mismatched, reused, or
  out-of-scope inputs fail closed without invoking accessors.
- Runtime substitution is atomic, explicit, Coulson-authorized, and auditable.
- The Mission Journal is authoritative; attestations and audit records are not.
- Decision audit is durably verified before dispatch; a result can follow only
  an exact preceding `allow` decision.
- Tool results remain attributed to the actual executor, not the reasoning
  runtime.
- Human-only seats cannot receive runtime bindings or invoke tools.
- Existing v2-v5 journal and Issue #8 runner behavior remain compatible.
- Package tests, workspace tests, packed strict consumer, package dry run, and
  `git diff --check` pass.

## Non-goals

- Issue #34 broker/probe implementation
- Issue #42 executable May runtime
- Issue #13 analytics products
- Issue #32 routing or occupancy
- Issue #38 Mission Dossier
- GitHub adapter or Mission Workspace changes
- merge, deployment, release, destructive Git, credentials, or production work

## Benchmark metrics

Metrics use `measured`, `derived`, `estimated`, or `not observable` labels.

### Benchmark 1 control — PR #52

- elapsed Mission-Brief-to-final-commit: 40m 56s (derived)
- files changed: 14 total / 13 implementation (measured)
- implementation cycles: 2 (measured)
- Fury correction cycles: 1 (measured)
- focused test files added: 3 (measured)
- cloud subagent invocations: 7, including one interrupted pass (measured)
- aggregate premium tokens/context: likely much higher due to repeated
  full-context forks (estimated; exact totals not exposed)

### Benchmark 2 live metrics

- local Daisy calls: 1
- local Daisy input tokens: 48,421
- local Daisy output tokens: 2,577
- local Daisy reasoning tokens: 707
- supplied Daisy context: 190,485 bytes / 3,856 lines
- Daisy time to first token: 115.826 seconds
- elapsed intake through Daisy completion: 3m 59s
- local May calls: 4 (one non-actionable terminal request, one connection
  failure, one successful bounded implementation blueprint, and one successful
  Fury-correction blueprint)
- successful local May input tokens: 63,076
- successful local May output tokens: 6,766
- successful local May reasoning tokens: 1,776
- first May repository context: 193,774 bytes / 3,918 lines, plus the 3,556
  byte / 112 line May role prompt
- failed redirected May repository context: 130,574 bytes / 2,536 lines,
  plus the role prompt; token counts were not returned
- successful bounded May context: 6,979 bytes / 169 lines, plus the role prompt
- successful bounded May time to first token: 2.473 seconds
- May correction context: 38,210 bytes / 527 lines, plus the role prompt;
  16.271 seconds to first token
- total successful local-model usage (Daisy + May): 111,497 input tokens,
  9,343 output tokens, and 2,483 reasoning tokens
- premium subagent invocations: 1 (single sequential Fury review)
- primary Codex token count and dollar cost: not observable
- implementation cycles: 1
- Fury correction cycles: 1
- files changed: 14 total / 13 implementation
- focused tests added: 13 across 3 files
- integration verification: 160 team-system tests and 9 multiband tests pass;
  packed strict consumer and `git diff --check` pass
- elapsed benchmark start through integration: 40m 46s
- elapsed Coulson authorization through integration: 27m 46s
- elapsed benchmark start through Fury correction completion: 54m 52s
- elapsed Coulson authorization through Fury correction completion: 41m 52s
- human interventions: 3 (planned Wheels Up authorization, one folder
  verification question, and one PR review-visibility correction)

## Stop condition

Stop with the benchmark PR ready for Fitz at a Fury-approved exact revision.
Coulson retains merge authority. Preserve PR #52 unchanged.
