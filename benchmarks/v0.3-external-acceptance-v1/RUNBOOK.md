# V0.3 minimum external acceptance fixture

This is the versioned minimum fixture owned by Issue #12. It is a private,
human-operated acceptance asset, not a public SHIELD runner, CLI, scheduler, or
release command. The broader six-mission Multi Band campaign remains owned by
Issue #14.

## Current disposition

The fixture intentionally stops with explicit dependency blockers:

- Issue #24 must have a Coulson-accepted V0.3 product contract.
- Issue #112 must provide revision-bound Fury conformance and supersession.
- Issue #113 must enforce exact-scope `review.publish`.

Do not reinterpret the blocker result as a release failure or manufacture
substitute evidence. A new fixture revision is required when those contracts
become available.

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

The host also supplies a trusted-journal replay-anchor envelope from outside
the fixture root. The envelope digest must match its canonical projection;
fixture evidence cannot provide or replace that anchor. The launcher then
passes the baseline to `composeMinimumFixture(...)` with the measured artifact
digest, external repository root, exact base and current head revisions,
GitHub host configuration, blind classification, and conditional Simmons
choice. Caller-supplied changed paths are not accepted.

The current v1 driver:

- copies the supplied artifact bytes into a fresh temporary Git repository,
  installs only that exact local artifact with scripts and network access
  disabled, and consumes the documented `@shield/team-system/config`,
  `@shield/team-system/supervision`, and `@shield/team-system/adapter`
  specifiers;
- rejects a fake, substituted, un-installable, wrong-name, or un-importable
  artifact before claiming composition;
- creates a non-authoritative adapter-failure candidate without contacting
  GitHub;
- records Fitz and optional Simmons as waiting;
- performs no branch, PR, publication, merge, deployment, or release effect;
- returns the explicit #24, #112, and #113 blockers.

## Candidate grading, failure injection, and rollback

After the human-authorized mission produces a candidate that passes
`node --test`, call `gradeCandidateWithFailureInjection({ fixtureRoot,
baseRevision, headRevision })`.

The fixture-only grader:

1. verifies and records the exact base, current head, and Git-derived paths;
2. verifies the frozen defective source and exact test bytes at the adoption
   base and rejects unexpected untracked files while respecting normal Git
   ignore rules;
3. records the candidate digest;
4. executes only `test/greeting.test.mjs`;
5. replaces only `src/greeting.mjs` with the frozen defective bytes;
6. requires the deterministic lane to fail;
7. restores the exact candidate bytes in a `finally` path;
8. requires the lane to pass again; and
9. proves the restored digest equals the original candidate digest.

Immediately before injection and rollback, the grader reopens the target with
no-follow semantics and verifies that the open file is the confined,
non-symlink regular file it inspected. Replacement of the target causes a
blocking result; the grader never follows the replacement.

If injection, rollback, or validation is unavailable, stop. Do not claim pass.
Candidate execution has no network sandbox, so its result reports network
effects as not observable. Operators must not reinterpret that state as proof
that no network effect occurred.

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
