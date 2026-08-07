# Issue #239 — exact V0.3 fixture package-pin rebind plan

## Frozen identity and boundary

- Mission: `mission:issue-239`
- Subject: `github:RanSolo/shield-workspace/issue/239`
- Base: `main` at `01a4fbdba7534de799cd7f16109dc02670cf696d`
- Branch: `agent/issue-239-fixture-pin-rebind`
- Current package digest: `02853c218a4119d45c9fde683d2ee22d1ef22f5a70618372d0bf7cf7a9af4af9`
- Expected rebound identity-record digest: `d494a075b8a4a217e60f42cd89c738d4abbd397e86b189f346190d8961c4dfcc`
- Parent release gate: #29
- Paused proving mission: `mission:issue-29-current-candidate-proof`

This mission updates versioned benchmark identity data only. It does not change
the package, product behavior, fixture behavior, authority, schemas, runtime,
launcher, verifier, isolation policy, or evidence semantics. It must not invoke
the disposable external fixture.

## Verified starting evidence

The package subtree at the planning branch is byte-identical to exact current
main. After a clean package build, two independent `npm pack --ignore-scripts`
invocations produced the same SHA-256:

`02853c218a4119d45c9fde683d2ee22d1ef22f5a70618372d0bf7cf7a9af4af9`

The versioned fixture identity still names the prior #137 artifact digest:

`9c2eb437fc13d371b38577c31556d88b0c921f2fd2f2fc24ca22badd932a2823`

`verifyFixtureIdentity(...)` requires the external release baseline's package
digest to match the versioned identity record, and the host launcher requires
the measured tarball to match the same baseline digest before isolation or
installation. A temporary identity override is excluded because it would make
the proof depend on unversioned, unreviewed bytes.

## Exact implementation

### 1. Rebind the versioned identity

In `benchmarks/v0.3-external-acceptance-v1/fixture-identity-v1.json`, change only
`package.digest` from the prior digest to:

`02853c218a4119d45c9fde683d2ee22d1ef22f5a70618372d0bf7cf7a9af4af9`

Do not change the fixture ID, package name/version/algorithm, covered artifact
set, paths, or framed covered-artifact digests.

After that sole byte-level semantic change, independently compute the raw file
SHA-256 and require it to equal:

`d494a075b8a4a217e60f42cd89c738d4abbd397e86b189f346190d8961c4dfcc`

Any mismatch stops implementation before the test baseline is edited.

### 2. Rebind the independent test baseline

In `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`, change only
the test baseline's:

- `identityRecordDigest` to
  `d494a075b8a4a217e60f42cd89c738d4abbd397e86b189f346190d8961c4dfcc`;
- `package.digest` to
  `02853c218a4119d45c9fde683d2ee22d1ef22f5a70618372d0bf7cf7a9af4af9`.

Do not alter test behavior, assertions, fixtures, helpers, launcher/verifier
digests, isolation values, or failure semantics.

## Exact implementation scope

- `benchmarks/v0.3-external-acceptance-v1/fixture-identity-v1.json`
- `benchmarks/v0.3-external-acceptance-v1/test/fixture.test.mjs`

The mission brief and this plan are immutable planning artifacts after Fury
approval. Only the two benchmark paths above are implementation-mutable.

## Required validation

1. Prove there is no package-subtree delta from
   `01a4fbdba7534de799cd7f16109dc02670cf696d`.
2. Build `@shield/team-system`, pack it twice with `--ignore-scripts`, and require
   both tarballs to have the approved package SHA-256.
3. Require the versioned identity file's raw SHA-256 to equal the approved
   identity-record digest.
4. Run the complete fixture suite:

   ```text
   npm --prefix benchmarks/v0.3-external-acceptance-v1 test
   ```

5. Run the full package suite directly with test-file concurrency one:

   ```text
   npm run build --workspace @shield/team-system
   node --test --test-concurrency=1 packages/shield-team-system/tests/*.test.mjs
   ```

6. Run package dry-run and `git diff --check`.
7. Inspect the exact base-to-head diff and require only the two authorized data
   substitutions in the implementation delta.
8. Mack validates the exact clean implementation revision. Fury then performs
   exact-revision conformance review.

Existing negative fixture tests must continue proving that a substituted
package or mismatched baseline fails closed. No external disposable repository
is created and no fixture launcher/composer/grader invocation is permitted in
this mission.

## Publication and stop condition

After Mack and Fury pass, publication may create at most one bounded draft pull
request under separate exact publication authority. Do not mark it Ready for
Review, merge it, execute the fixture, perform Asmark work, enter #14, deploy,
or release. After ordinary human merge disposition, return immediately to the
already authorized `mission:issue-29-current-candidate-proof` and prepare its
matching out-of-tree release baseline.
