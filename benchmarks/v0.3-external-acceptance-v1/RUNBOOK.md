# V0.3 minimum external acceptance fixture

This is the versioned minimum fixture owned by Issue #12. It is a private,
human-operated acceptance asset, not a public SHIELD runner, CLI, scheduler, or
release command. The broader six-mission Multi Band campaign remains owned by
Issue #14.

## Current disposition

The fixture prerequisites are dispositioned:

- Issue #24 is closed with the accepted V0.3 product contract.
- Issue #138 is closed with content-addressed fixture identity, external
  installation identity, and evidence/measurement-class hardening.
- Issue #140 is closed with trusted isolation and interruption-safe rollback.

The manifest therefore has no dependency blockers. A literal `ready` result is
only a closed, measured preflight for the supplied external revision. It is not
human evidence and grants no package execution, fixture grading, publication,
merge, deployment, or release authority.

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
- inspects the exact external repository root, adoption base, and current head;
- requires a canonical clean repository whose frozen base bytes match the
  template and whose only base-to-head change is `src/greeting.mjs`;
- records Fitz and optional Simmons as waiting through the returned evidence
  inventory;
- performs no branch, PR, publication, merge, deployment, or release effect;
- returns literal `ready` with the measured external revision, fixture/host/blind
  preflight, and human-evidence inventory.

Preflight does not read, install, import, or execute the package artifact and
does not mutate either repository. Any invalid or blocked revision result stops
the run before trusted composition.

Execution-capable package composition must use the independently pinned launcher entry point
`composeExternalArtifact(...)`. It copies the exact external tarball into a
private disposable root, runs offline `npm install --ignore-scripts` as the
separate `composition.install` phase, and imports only the three frozen public
surfaces as `composition.import`. Both phases require the external isolation
envelope, fresh protected-adapter evidence, bounded process-group supervision,
one sealed worker copy per invocation, and closed revision-bound receipts.
Before creating the isolation root, the launcher requires the measured tarball
SHA-256 to equal the package digest pinned by the release baseline and identity
record. A same-name/version package with different bytes stops with
`package_artifact_digest_mismatch`. Direct composition remains blocked; a
missing or uncertain denial proof is isolation `not-observable`, not evidence
that no effect occurred.

## One disposable unscored run

Run this sequence once, using a newly created repository outside the SHIELD
workspace and the exact implementation-revision package retained by the
operator:

1. Create the clean post-install/post-`shield init` adoption base described
   above, then create one candidate commit changing only `src/greeting.mjs`.
2. Call `launchExternalFixture(...)` with the external release-baseline path and
   exact operator input. Require literal `ready` and retain its measured
   revision, fixture/host/blind preflight, and evidence inventory.
3. Call `composeExternalArtifact(...)` with the same exact revisions, package
   path, release baseline, and isolation envelope. Require literal `composed`
   and retain the artifact digest, installed name/version, and phase list.
4. Call `gradeExternalFixture(...)` with the same exact revisions and trusted
   paths. Require literal `passed`, deterministic injected failure, exact
   restoration, capability-denial evidence, cleanup evidence, and unchanged
   operator-checkout readback.
5. Record exact SHIELD and external revisions, package digest, runtime/tool
   identities, timing and usage where observable, friction, every human
   intervention, and all returned receipts. Stop.

This is a local disposable run. These calls make no GitHub or Asmark effect and
cannot authorize Issue #29, publication, merge, deployment, or release.

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
   sandboxed worker processes with a fresh sealed worker copy for each
   invocation, selecting only `test/greeting.test.mjs`;
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
