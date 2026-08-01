# V0.3 minimum external acceptance fixture

This is the versioned minimum fixture owned by Issue #12. It is a private,
human-operated acceptance asset, not a public SHIELD runner, CLI, scheduler, or
release command. The broader six-mission Multi Band campaign remains owned by
Issue #14.

## Current disposition

The fixture intentionally stops with explicit dependency blockers:

- Issue #24 must have a Coulson-accepted V0.3 product contract.
- Issue #138 must provide content-addressed fixture identity, external
  installation identity, and evidence/measurement-class hardening.
- Issue #140 must isolate fixture execution and make rollback interruption-safe.

Do not reinterpret the blocker result as a release failure or manufacture
substitute evidence. A new fixture revision is required when the manifest-owned
dependency states change.

## Prepare a fresh external repository

1. Copy `template/` into a new empty directory outside this workspace.
2. Run `git init` and set the operator-selected default branch. Do not define
   the mission base yet.
3. Pack the exact `@shield/team-system` source under evaluation and record the
   tarball SHA-256. Install only that exact artifact as a development dependency.
4. Run `shield init`, inspect every changed path, repeat `shield init`, and run
   `shield doctor`. Record installation friction and every human intervention.
5. Commit the clean post-install, post-initialization adoption state. This
   commit—not the untouched template commit—is the exact mission base.
6. Record the repository, adoption-base revision, host configuration, and
   whether the run is blind, partially informed, or non-blind. Record whether
   prior solutions, diffs, findings, or benchmark results were visible. A blind
   run cannot record prior solutions as visible.
7. Create the mission candidate as one later commit whose only changed path
   relative to the adoption base is `src/greeting.mjs`. Record that commit as
   the exact current head.

At the adoption base, `src/greeting.mjs` and `test/greeting.test.mjs` must match
the frozen template bytes. The exact baseline lane is
`node --test test/greeting.test.mjs` and must fail only the
whitespace-normalization test. The approved mission change set is exactly
`src/greeting.mjs`.

## Compose without host effects

Do not import `src/driver.mjs` directly from a candidate-controlled working
tree. The host must invoke `benchmarks/v0.3-fixture-host-launcher.mjs` from an
independently pinned installation, supplying a release baseline stored outside
the fixture root. That baseline pins the launcher digest, verifier digest,
identity-record digest, and package identity. The launcher verifies those
digests before importing any fixture module.

The trusted-journal replay-anchor envelope is loaded separately from
`launchExternalFixture(...)`; its digest must match its canonical projection,
and fixture evidence cannot provide or replace that anchor. The launcher passes
`operatorInput` to `composeMinimumFixture(...)` with the package artifact path,
external repository root, exact base and current head revisions, GitHub host
configuration, blind classification, prior-solution visibility, and conditional
Simmons choice. It supplies the release baseline through the separate trusted
host context, so package identity and digest never come from operator input.
Caller-supplied changed paths are not accepted.

The current v1 driver:

- validates the closed input shape, blind-status constraints, host
  configuration, and syntactic external revision identity;
- verifies the trusted fixture identity and release baseline before any
  external repository inspection, package artifact inspection, installation,
  import, or execution;
- records Fitz and optional Simmons as waiting through the returned evidence
  inventory;
- performs no branch, PR, publication, merge, deployment, or release effect;
- returns the explicit manifest-owned dependency blockers for the current
  fixture revision.

While those blockers remain, package installation, artifact composition,
adapter-failure candidate generation, and candidate execution are deferred.

## Candidate grading, failure injection, and rollback

After the human-authorized mission produces a candidate that passes
`node --test`, do not call the grading driver directly. Invoke the independently
pinned host launcher and call `gradeExternalFixture(...)` with the benchmark
fixture root, operator repository root, exact base/head revisions, and a closed
trusted host context containing external release-baseline and isolation-envelope
paths. Direct driver grading and composition fail closed with
`trusted_isolation_supervisor_required`.

The trusted supervisor:

1. snapshots exact operator HEAD, porcelain bytes, target/test bytes, and modes;
2. verifies the frozen base, exact head, and Git-derived change scope;
3. archives the exact head into a fresh private disposable root;
4. validates the external isolation envelope and the protected, Apple-signed
   `sandbox-exec` identity, then runs a fresh nonce-bound denial probe;
5. executes candidate, injected, and restored lanes in separately receipted
   sandboxed worker processes, selecting only `test/greeting.test.mjs`;
6. injects and restores bytes only inside the disposable archive;
7. terminates and reaps an interrupted or uncertain worker;
8. removes the disposable root after the worker is reaped; and
9. exact-matches the operator snapshot before promoting any result.

The host guarantee covers worker interruption and observable supervisor
outcomes. A hard `SIGKILL` of the supervisor may leave an orphaned directory
named `shield-v03-supervisor-*` under the host temporary directory, but cannot
leave injected bytes in the operator checkout because that checkout is never a
write target. Recover such an orphan only after confirming no owning supervisor
or worker remains; orphan presence is not cleanup evidence for the interrupted
run.

The Darwin adapter exception is closed to the canonical SIP/authenticated-root
protected `/usr/bin/sandbox-exec`, its pinned bytes, Apple signature,
`com.apple.sandbox-exec` identifier, and pinned CDHash. The trusted probe must
observe private-root writes as allowed and network, out-of-root writes, and
non-allowlisted child execution as denied under the exact pinned policy before
candidate code starts. On another host, or if any identity, protection, probe,
receipt, cleanup, or integrity evidence is missing or uncertain, stop with
isolation `not-observable`. Never reinterpret that state as proof that no
effect occurred.

## Evidence inventory

Preserve measured or attributed records for:

- exact package artifact digest, external base/head revisions, host
  configuration, and blind status;
- installation friction, clocks, model/runtime/executor identity, usage where
  observable, and all human interventions;
- explicit Coulson authorization;
- Fury revision history, stale evidence, and exact-head approval;
- exact-scope review publication;
- Fitz waiting and signed human technical review;
- optional Simmons waiting and signed product review;
- host-adapter failure and manual fallback;
- failure injection and exact rollback.

No fixture output is human authority or readiness. GitHub is not contacted by
the driver. Merge, deployment, publication, and release remain outside this
fixture.
