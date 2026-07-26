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
2. Run `git init`, set the operator-selected default branch, and commit the
   untouched fixture as the exact base revision.
3. Record the repository, base revision, host configuration, and whether the run
   is blind, partially informed, or non-blind. Record whether prior solutions,
   diffs, findings, or benchmark results were visible.
4. Pack the exact `@shield/team-system` source under evaluation and record the
   tarball SHA-256. Install only that exact artifact as a development dependency.
5. Run `shield init`, inspect every changed path, repeat `shield init`, and run
   `shield doctor`. Record installation friction and every human intervention.

The initial `node --test` lane must fail only the whitespace-normalization test.
The approved mission change set is exactly `src/greeting.mjs`.

## Compose without host effects

Call `composeMinimumFixture(...)` from `src/driver.mjs` with the measured
artifact digest, external base revision, GitHub host configuration, blind
classification, conditional Simmons choice, and exact changed-path set.

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
`node --test`, call `gradeCandidateWithFailureInjection(externalRoot)`.

The fixture-only grader:

1. records the candidate digest;
2. replaces only `src/greeting.mjs` with the frozen defective bytes;
3. requires the deterministic lane to fail;
4. restores the exact candidate bytes in a `finally` path;
5. requires the lane to pass again; and
6. proves the restored digest equals the original candidate digest.

If injection, rollback, or validation is unavailable, stop. Do not claim pass.

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
