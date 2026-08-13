# Issue #275 — `shield-nx-extraction/v1` exact plan

Plan status: revised for Fury re-review; synthetic implementation only.

Baseline revision: `d3f29002fe6c249152763815a633132589b5a9b1`  
Plan revision: the SHA-256 digest recorded in the adjacent `.sha256` sidecar;
the managed worktree cannot write the parent Git worktree index, so a local
commit is unavailable. Fury must review this exact content-addressed artifact,
not the baseline alone.  
Pinned Nx: `23.1.0`  
Authority: `none`  
Execution class: `synthetic`

## Scope

Create a repository-local planning/apply/rollback generator contract for a
single buildable npm-workspace library. The implementation is exercised only
in `/private/tmp/shield-275-nx-fixture`. Production paths, Team System public
exports, schemas, imports, lockfiles, and authority-bearing files are rejected
by v1.

The generator may use public `@nx/devkit@23.1.0` APIs for workspace inspection
and deterministic file planning. It must not import Nx private internals,
`@nx/js`, or `@nx/plugin`; it must not invoke a nested generator, package
manager, formatter, subprocess, or install callback.

## Closed schema

Required fields:

- `operation`: `plan | apply | rollback`.
- `expectedRepositoryRevision`: exact Git SHA.
- `capabilityName`: lower-kebab-case and collision-free.
- `description`: non-empty bounded text.
- `ownerId`: checked-in ownership metadata, not a seat, executor, approver, or
  authority identity.
- `sourceFiles`: sorted repository-relative source paths.
- `exports`: sorted explicit export records.
- `dependencies`: sorted typed dependency records.
- `executionClass`: must equal `synthetic`.
- `manifestPath` and `manifestDigest`: required for `apply` and `rollback`.

Unknown keys, duplicates, absolute paths, traversal, symlinks, case-folding
collisions, missing files, production paths, and caller overrides of derived
values fail before mutation.

Derived values:

```text
projectName = @shield/<capabilityName>
root        = packages/<capabilityName>
buildable   = true
authority   = none
tags        = [scope:shield, type:library, owner:<ownerId>, authority:none]
```

## Deterministic operations

`plan` is side-effect-free. It reads only the pinned workspace state and emits
canonical UTF-8 JSON with lexically sorted keys and arrays. It contains:

- contract and generator source digests;
- exact Git revision and Nx/toolchain versions;
- normalized inputs;
- baseline project, target, edge, and lockfile digests;
- every `create | modify | delete` operation;
- repository-relative path, preimage state/hash, postimage hash, reason, and
  acceptance criterion;
- manifest digest, computed over the canonical manifest body excluding the
  `manifestDigest` field and then placed in the outer envelope.

No timestamps, random IDs, host paths, environment values, network results, or
implicit dependency discovery are permitted. Identical bytes and inputs must
produce byte-identical manifests.

`apply` accepts only a reviewed manifest. Before writing, it recomputes every
identity, preimage, source digest, graph digest, tool version, and derived
value. Any mismatch produces zero mutation. The write is staged in a private,
disposable staging directory, verified against the postimage hashes, and
committed in one deterministic filesystem transaction. A fault during commit
invokes compensation from the preimage journal; if compensation cannot prove
the original bytes, the operation stops in durable `recovery_required` state
and never guesses or overwrites.

The transaction state machine is `prepared → staged → committing → committed`
or `compensating → compensated`; an unresolved state is
`recovery_required`. Recovery is an internal, lock-held phase of matching-
manifest `apply` or `rollback`, not a fourth operation. The supplied manifest
digest must equal the journal-bound digest or the operation returns
`recovery_required` without mutation.

Apply/rollback acquire an exclusive lock before root or journal inspection,
use same-filesystem staging and backups, and update the journal through a
same-directory temporary file, fsync of the temporary file, atomic rename, and
fsync of the journal directory. They fsync staged files and backups and their
directories, persist intent before each target rename, fsync the resulting
file and both affected directories, persist completion afterward, and hold the
lock through terminal journal state and cleanup. State transitions are
`staged|committing → compensating → compensated|recovery_required`.

Fault injection is required before and after every write, journal replacement,
fsync, rename, directory fsync, and finalization boundary, including abrupt
process termination. Every injected failure must either leave the exact
preimage or produce a durable recovery record with no unverified continuation.

Exact postimage replay returns `already_applied`. A valid unfinished journal
with matching manifest digest triggers internal compensation under the lock;
stale, mismatched, or invalid journals return `recovery_required` with zero
mutation. Partial or divergent state without a valid matching journal also
returns `recovery_required` with zero mutation.

`rollback` uses the same preflight, journaling, staging, verification, deterministic commit,
compensation, and durable recovery phases. It requires every current byte to
match the recorded postimage, then applies the inverse operations. Any
mismatch fails closed. Fault injection must prove rollback either restores the
complete pre-apply state or records `recovery_required` without guessing.

## Generated synthetic boundary

The manifest permits only these project files:

- `package.json` with explicit `@shield/<capabilityName>` name and `dist`
  exports;
- `project.json` with explicit build, test, and lint targets;
- build and lint configuration;
- `src/index.mts` and declared source closure;
- tests and README;
- exact workspace-link lockfile records, if the synthetic fixture uses a
  lockfile. Production lockfiles are forbidden in v1; a disposable fixture
  lockfile may be changed only when listed in the manifest and must be restored
  transactionally.

Build output is confined to `<root>/dist`. Build, test, and lint targets have
explicit hermetic inputs; cache is enabled only after the fixture proves no
network, secret, clock, randomness, or undeclared environment input.

The local graph-conformance check compares actual Nx project edges with the
manifest allowlist. Tags are metadata, not enforcement. Lint must be an actual
executable TypeScript lint/conformance check, not a renamed typecheck.

The fixture must have a canonical, non-symlink root identity and required
marker at `.shield/synthetic-fixture.json` with exactly one trailing LF after
the canonical contents
`{"purpose":"issue-275-nx-extraction-v1","baselineRevision":"d3f29002fe6c249152763815a633132589b5a9b1"}`; its SHA-256 is
`d16214e36c949b93ba944295c00aaef70ed21d6350188c08d240d0c6627206f7`. The marker digest and opened
canonical root identity are bound into the manifest and revalidated through
commit using no-follow checks. Only that fixture’s explicitly manifested
lockfile may change; primary checkout identity, symlink/hardlink lockfiles,
path races, concurrent invocation, and any other lockfile are rejected.

## Acceptance sequence

1. Create a fresh disposable checkout from the baseline revision and run
   `npm ci`. Assert Nx and public `@nx/devkit` resolve exactly to `23.1.0`,
   exactly these projects exist—`@shield/mission-preparation`,
   `@shield/team-system`, and `@shield/multiband`—and the sole edge is
   `@shield/multiband → @shield/team-system`.
2. Validate schema rejection cases and derived values.
3. Run `npm exec -- nx generate … --dry-run --no-interactive` through the local
   plan adapter and verify zero file/config/dependency mutation.
4. Run two independent plans and compare bytes and digest.
5. Apply the reviewed manifest and verify exact file set and hashes.
6. Run build, test, lint, graph, affected, package-link, and cache checks.
7. Run apply and rollback fault-injection cases in isolated fresh fixtures;
   use a fresh fixture and separately killed process for every journal,
   fsync, rename, directory-fsync, write, and finalization injection point,
   then reopen from disk and verify the complete tree, modes, lockfile,
   journal, and recovery decision.
8. Seed compile, test, and lint failures; after each negative test restore the
   exact prior postimages before continuing.
9. In a fresh restored fixture, re-run apply for `already_applied`, then create divergent partial state and
   prove `recovery_required`; restore the fixture through the test harness
   before any subsequent rollback check. Include missing/mismatched marker,
   primary-root, symlink, concurrent-invocation, stale-journal, partial-replay,
   and ambiguous-recovery cases.
10. In a final fresh restored fixture, roll back last and verify the complete tracked tree and fixture lockfile
   return to their exact pre-apply bytes.
11. Record all results in the content-addressed Issue #275 report.

## Authority and handoff

This plan authorizes no production mutation. Fury’s technical review is still
required after implementation. A separate human authority gate is required
before any production extraction or workspace dependency mutation.
