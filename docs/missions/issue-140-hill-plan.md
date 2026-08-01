# Mission #140 — disposable fixture isolation and interruption-safe rollback

## Review identity

- Seat: Hill (orchestration)
- Scope-freeze base: `186bc0231245b98e43e8f10ecc12be503cabd744`
- Issue: #140
- Parent gate: #137
- Downstream release gate: #29
- Mode: Delivery (proposed; not active before mission authorization)
- Status: proposed revision for exact-revision Fury review

## Objective

Move all execution-capable composition and grading work out of the operator
checkout into disposable workspaces, require an independently pinned host
isolation capability before evaluated code executes, supervise interruptible
workers from a non-candidate process, and report unsupported capability
isolation as not-observable without claiming that no effect occurred.

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
- `composeInstalledArtifact(...)` directly invokes `npm install` and then Node
  to import and execute the evaluated package. Dependency preflight currently
  masks this latent unsandboxed path, but #137 disposition would expose it.
- Baseline fixture tests pass 27/27 at the scope-freeze revision after the
  package is built with its pinned TypeScript dependencies.

## Approved implementation shape proposed to Fury

### 1. Trusted execution supervisor

Extend `benchmarks/v0.3-fixture-host-launcher.mjs` as the trusted supervisor for
both composition and grading. Evaluated package/candidate code runs only in a
separate worker subprocess; the supervisor never imports it. The supervisor
must:

1. validate a closed request and exact base/head revisions;
2. capture a before snapshot of operator HEAD, porcelain status bytes, tracked
   target/test modes, and target/test content digests;
3. materialize the exact requested head into a fresh directory below a
   host-created temporary root without modifying the source repository;
4. create a fresh launcher nonce and spawn one bounded worker with only a
   closed, revision-bound request;
5. terminate and reap the worker on timeout, malformed IPC, uncertainty, or an
   explicit interruption;
6. remove the disposable root after the worker is reaped; and
7. capture and exact-match the operator snapshot after every outcome.

The supervisor—not the interruptible worker—owns cleanup and operator
reverification. Tests must kill the real worker subprocess at every emitted
checkpoint and prove that the supervisor reaps it, removes its workspace, and
returns an integrity-bound blocking receipt. Injected exceptions alone are not
sufficient interruption evidence.

The guarantee is explicitly bounded to worker interruption and every outcome
the supervisor can observe. Hard termination of the supervisor itself may
leave a disposable temporary directory, but can never leave injected bytes in
the operator checkout because that checkout is never a write target. The
runbook must identify bounded orphan-directory recovery and must not claim
cleanup evidence after an unobservable supervisor `SIGKILL`.

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

### 3. Pinned capability-isolation contract

Preserve the existing closed release-baseline v1 and its verifier unchanged.
Define a separate closed isolation-envelope v1 stored outside the fixture root.
The already baseline-pinned launcher embeds the expected canonical envelope
digest and accepts only a regular, non-symlink external envelope whose bytes
match that digest. This avoids weakening or silently extending the release
baseline contract.

The isolation envelope pins the adapter ID, contract version, adapter
executable digest, denial-policy digest, worker entry-point path, and worker
entry-point digest. Before spawning anything, the launcher no-follow opens the
regular worker entry point and external adapter executable, retains each handle
through its source read, and exact-matches the bytes to the envelope identities.
Candidate/operator input cannot supply the envelope, its expected digest,
either executable identity, or policy.

The supervisor then writes those verified bytes to exclusively created files
inside its private mode-0700 temporary root, syncs them, removes write
permission, reopens them with no-follow semantics, and exact-matches readback
bytes plus regular-file identity. It executes only these supervisor-owned
verified copies, never an externally mutable source pathname. Each copy is
single-run and removed after its child is reaped. Failure to create, sync, read
back, seal, or retain the expected copy identity blocks before spawn.

#### Darwin system-adapter exception proposed after implementation evidence

Implementation evidence on the authorized host showed that the SIP-protected
`/usr/bin/sandbox-exec` runs Node correctly from its system path, while a
byte-identical private copy exits without launching the Node child. Therefore
the private-copy rule above remains mandatory for the worker and for any
adapter that can execute correctly from a private copy, but the following
closed exception is proposed for Fury review:

- only adapter ID `macos-sandbox-exec` may use the exception;
- its executable path is the launcher-owned constant
  `/usr/bin/sandbox-exec`, never input or envelope data;
- the launcher no-follow opens the regular executable, retains the descriptor,
  exact-matches its bytes to the envelope digest, and requires root ownership,
  a non-group/non-world-writable mode, the canonical `/usr/bin` path, and the
  Darwin platform before any worker starts;
- the launcher exact-matches the same descriptor identity and current path
  identity immediately before spawn and again after the child is reaped;
- the worker still runs only from a sealed, read-back-verified private copy;
- any missing protection, metadata drift, path substitution, digest mismatch,
  non-Darwin host, or post-run identity mismatch blocks as isolation
  `not-observable`; there is no unsandboxed fallback; and
- tests must prove that a mutable lookalike adapter cannot use this exception
  and that substitution before or during spawn blocks promotion.

This is a bounded host-capability exception, not a generalized trusted-path
class. It does not weaken the external envelope, worker-copy, receipt,
disposable-workspace, cleanup, or operator-integrity requirements.

Runtime adapter metadata and receipts must exact-match the envelope before any
worker starts. The adapter is a host capability supplied separately from
operator input and cannot be selected or configured by candidate/fixture data.

Every execution-capable phase receives a fresh closed request and returns one
closed terminal receipt. Each request/receipt is bound to:

- a fresh invocation ID derived from the launcher nonce and phase sequence;
- the disposable canonical root;
- exact base/head revisions;
- the phase (`composition.install`, `composition.import`, `grade.candidate`,
  `grade.injected`, or `grade.restored`);
- current target/test digests and file modes when applicable;
- an allowlisted executable identity and exact argv;
- the pinned adapter and denial-policy identities;
- bounded timeout and output; and
- a closed result distinguishing pass, expected failure, timeout, unavailable,
  denied, and uncertain execution.

Invocation IDs are single-use. The supervisor rejects mismatched, reused,
stale, substituted, cross-phase, cross-root, cross-revision, non-terminal, or
malformed receipts before promoting any phase.

There is no unsandboxed success fallback. If the host cannot prove capability
denial, stop before candidate execution with isolation state
`not-observable`. Do not reinterpret that state as proof of no effects.

### 4. Isolate composition as well as grading

Route both `npm install --offline --ignore-scripts` and the Node consumer import
inside `composeInstalledArtifact(...)` through the same verified isolation
contract. Preserve their separate phase identities and receipts. Candidate or
package-controlled data cannot select the executable, argv, environment,
working directory, limits, or denial policy.

Add malicious artifact/import probes that attempt network access, writes
outside the disposable root, child-process execution beyond the allowlist, and
operator-checkout mutation. Verified denial must be observable in the adapter
receipt; an unsupported host blocks before import/execution as
`not-observable`.

### 5. Interruption-safe grading state machine

Make grading checkpoints explicit and testable:

1. disposable workspace prepared;
2. candidate lane passed;
3. frozen defect injected;
4. injected lane failed as expected;
5. exact candidate bytes restored;
6. restored lane passed;
7. disposable workspace removed; and
8. operator integrity reverified.

The worker reports each checkpoint to the supervisor over bounded IPC. A real
worker termination or injected host failure at every checkpoint must leave the
operator snapshot unchanged. A missing cleanup, worker-reap, phase receipt, or
integrity receipt blocks; the supervisor never promotes a partial run.

### 6. Content addressing and documentation

- Refresh the grading-driver digest in
  `fixture-identity-v1.json` when driver bytes change.
- Refresh test-only independently pinned launcher/identity digests after the
  exact implementation is frozen.
- Preserve release-baseline v1 byte-for-byte. Add test-only external isolation
  envelopes whose canonical digest is independently fixed by the launcher
  fixture, and exercise malformed/extra fields, envelope substitution, adapter
  executable substitution, worker symlink/substitution, private-copy
  substitution, and policy identity substitution. Synchronize source
  substitutions between verification and spawn to prove that only the retained
  verified bytes copied into the supervisor root can execute.
- Refresh the independently pinned launcher digest after its embedded expected
  isolation-envelope digest and validation path are frozen. The fixture
  identity verifier and its v1 baseline schema remain unchanged.
- Update the runbook to require the trusted grading entry point and remove the
  direct operator-checkout grading instruction.
- Preserve the statement that unsupported isolation is not observable; never
  claim a negative network or host effect without verified denial evidence.

## Expected implementation paths

- `benchmarks/v0.3-fixture-host-launcher.mjs`
- `benchmarks/v0.3-fixture-isolation-worker.mjs` (new bounded worker entry point)
- `benchmarks/v0.3-external-acceptance-v1/src/driver.mjs`
- `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`
- `benchmarks/v0.3-external-acceptance-v1/fixture-identity-v1.json`
- `benchmarks/v0.3-external-acceptance-v1/RUNBOOK.md`

`verify-fixture-identity.mjs` is intentionally outside the implementation set:
the release-baseline v1 contract remains unchanged. Any need to alter that
verifier requires a bounded plan revision and fresh Fury review.

Any additional production path or contract change requires a bounded plan
revision and fresh Fury review.

## Acceptance checks

- The operator checkout's exact HEAD, status bytes, target/test bytes, and file
  modes remain unchanged after every success, failure, timeout, and injected
  interruption point.
- Failure injection and rollback occur only in a disposable exact-head root.
- Evaluated package and candidate code are never executed when capability
  isolation is unavailable, malformed, stale, substituted, reused, or
  uncertain.
- Verified isolation denies network and host effects, or the run stops with
  those effects explicitly `not-observable`.
- Direct and substituted symlinks, archive/path substitution, wrong revisions,
  cleanup/reap failure, forged adapter results, and cross-phase/root/revision
  receipt replay fail closed.
- Adapter and worker pathname substitution after verification cannot change
  executed bytes; substitution of a supervisor-owned copy blocks before spawn.
- Real subprocess interruption at every worker checkpoint leaves the operator
  snapshot unchanged and removes the observed disposable workspace.
- Malicious package-import and candidate probes cannot access network, write
  outside the disposable root, or mutate the operator checkout.
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
