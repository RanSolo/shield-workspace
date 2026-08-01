# Mission #140 — disposable fixture isolation and interruption-safe rollback

## Review identity

- Seat: Hill (orchestration)
- Scope-freeze base: `186bc0231245b98e43e8f10ecc12be503cabd744`
- Issue: #140
- Parent gate: #137
- Downstream release gate: #29
- Mode: Delivery (proposed; not active before mission authorization)
- Status: proposed for exact-revision Fury review

## Objective

Move fixture grading and failure injection out of the operator checkout into a
disposable exact-head workspace, require a trusted host isolation capability
before candidate code executes, make every interruption path clean up and
verify operator integrity, and report unsupported capability isolation as
not-observable without claiming that no effect occurred.

## Frozen boundary

- No external acceptance run and no #29 release decision.
- No GitHub, network, publication, merge, deployment, or release effect.
- No fabricated Coulson, Fitz, Simmons, or other human evidence.
- No generalized sandbox, runner, scheduler, container platform, or policy DSL.
- Do not alter the #137 dependency disposition in this slice. #140 returns
  exact evidence to #137; the parent gate decides whether #29 may begin.
- The operator repository may be inspected read-only but failure injection,
  rollback, and candidate execution must never target it.
- Missing, malformed, stale, substituted, ambiguous, or unavailable isolation
  evidence fails closed before candidate execution.

## Observed current behavior

- `gradeCandidateWithFailureInjection(...)` resolves the operator checkout and
  directly replaces `src/greeting.mjs` there with frozen defect bytes.
- A `finally` block attempts restoration, but process interruption can bypass
  that in-process rollback.
- The current passing result reports network effects as `not-observable` while
  still executing candidate code without a capability sandbox.
- Existing no-follow checks defend the target path but do not make the
  operator checkout disposable or deny candidate network/host capabilities.
- Baseline fixture tests pass 27/27 at the scope-freeze revision after the
  package is built with its pinned TypeScript dependencies.

## Approved implementation shape proposed to Fury

### 1. Trusted grading entry point

Extend `benchmarks/v0.3-fixture-host-launcher.mjs` with a grading entry point
that owns the operator-checkout boundary. The launcher must:

1. validate a closed grading request and exact base/head revisions;
2. capture a before snapshot of operator HEAD, porcelain status bytes, tracked
   target/test modes, and target/test content digests;
3. materialize the exact requested head into a fresh directory below a
   host-created temporary root without modifying the source repository;
4. invoke the fixture grader only with that disposable root and a trusted
   capability-isolation adapter supplied separately from operator input;
5. clean up the disposable root in a `finally` path; and
6. capture and exact-match the operator snapshot after every outcome.

The returned projection may describe operator integrity and isolation
observability, but it cannot claim human authority or release readiness.

### 2. Disposable exact-head materialization

Use a trusted host-controlled exact-head archive or equivalent read-only Git
materialization. Bind its source repository, requested head, resulting root,
and target/test bytes before grading. Candidate input cannot select archive
commands, destinations, copied paths, or executables.

The disposable root contains only the exact head tree needed by the frozen
lane. Failure injection and rollback occur only there. Cleanup failure returns
a blocking result even when the lane otherwise passed.

### 3. Capability-isolated lane execution

Replace direct `node --test` execution with one trusted adapter call bound to:

- the disposable canonical root;
- the exact `node --test test/greeting.test.mjs` command identity;
- denied network and host-effect capabilities when the host can prove them;
- bounded timeout and output; and
- a closed result distinguishing pass, expected failure, timeout, unavailable,
  denied, and uncertain execution.

There is no unsandboxed success fallback. If the host cannot prove capability
denial, stop before candidate execution with isolation state
`not-observable`. Do not reinterpret that state as proof of no effects.

### 4. Interruption-safe grading state machine

Make grading checkpoints explicit and testable:

1. disposable workspace prepared;
2. candidate lane passed;
3. frozen defect injected;
4. injected lane failed as expected;
5. exact candidate bytes restored;
6. restored lane passed;
7. disposable workspace removed; and
8. operator integrity reverified.

An interruption or injected host failure at every checkpoint must leave the
operator snapshot unchanged. A missing cleanup or integrity receipt blocks;
the grader never promotes a partial run.

### 5. Content addressing and documentation

- Refresh the grading-driver digest in
  `fixture-identity-v1.json` when driver bytes change.
- Refresh test-only independently pinned launcher/identity digests after the
  exact implementation is frozen.
- Update the runbook to require the trusted grading entry point and remove the
  direct operator-checkout grading instruction.
- Preserve the statement that unsupported isolation is not observable; never
  claim a negative network or host effect without verified denial evidence.

## Expected implementation paths

- `benchmarks/v0.3-fixture-host-launcher.mjs`
- `benchmarks/v0.3-external-acceptance-v1/src/driver.mjs`
- `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`
- `benchmarks/v0.3-external-acceptance-v1/fixture-identity-v1.json`
- `benchmarks/v0.3-external-acceptance-v1/RUNBOOK.md`

Any additional production path or contract change requires a bounded plan
revision and fresh Fury review.

## Acceptance checks

- The operator checkout's exact HEAD, status bytes, target/test bytes, and file
  modes remain unchanged after every success, failure, timeout, and injected
  interruption point.
- Failure injection and rollback occur only in a disposable exact-head root.
- Candidate code is never executed when capability isolation is unavailable,
  malformed, stale, or uncertain.
- Verified isolation denies network and host effects, or the run stops with
  those effects explicitly `not-observable`.
- Direct and substituted symlinks, archive/path substitution, wrong revisions,
  cleanup failure, and forged adapter results fail closed.
- The baseline, injected-failure, rollback, and restored lanes preserve their
  expected deterministic outcomes.
- Focused fixture tests, package build, package tests, and `git diff --check`
  pass at the exact implementation revision.

## Seat route and stop condition

1. Hill freezes this plan and mission context.
2. Fury reviews the exact plan revision.
3. Coulson supplies signed mission authorization for the exact approved brief.
4. Local May may receive one narrow implementation packet at a time only after
   the dispatch gate is ready. Two materially incorrect grounded attempts
   trigger a conscious runtime/host-ownership decision.
5. Fury reviews the exact implementation revision.
6. Stop at Fitz human review and #137 parent disposition.

No push, PR-ready transition, merge, external run, release, or #29 execution is
authorized by this plan alone.
