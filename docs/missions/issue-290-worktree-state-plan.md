# Issue #290 — deterministic SHIELD state for new Git worktrees

Status: proposed implementation plan for Fury review  
Mission: `mission:issue-290`  
Repository: `RanSolo/shield-workspace`  
Planning base: `56844464abaf67f0ea3c8fc3cc485864d66a922f`

## Objective

Add one deterministic, authority-neutral worktree-preparation boundary. Given an
explicit governed source worktree and an explicit destination worktree from the
same Git repository, SHIELD snapshots the source repository-policy files,
preflights the complete destination operation, installs only the permitted
policy files with no-follow durable writes, and returns a closed ready/blocked
receipt. A destination is never silently half-initialized and no mission state
is shared or copied.

This mission does not construct a Feature Flight, begin or authorize a mission,
copy credentials, or grant authority.

## Observed baseline

- `shield init` writes `.shield/config.json`, `.shield/.gitignore`, and an
  optional destination-derived `.shield/pipeline-profile.json` through
  `packages/shield-team-system/src/cli.mts`.
- Mission commands separately require
  `.shield/trusted-human-bindings.json`; `shield init` references bindings but
  does not materialize that registry.
- The repository-level `.gitignore` ignores all of `.shield/`, so ordinary
  `git worktree add` cannot inherit local SHIELD policy or mission state.
- Current contracts use paths beneath the selected worktree root. There is no
  canonical shared SHIELD directory in the Git common directory.
- Existing mission-preparation and Feature Flight stores already demonstrate
  the required no-follow, exclusive-create, sync, exact-readback, conflict, and
  recovery semantics, but no command composes them for fresh worktrees.
- `shield doctor` currently reports missing configuration but cannot classify
  an ordinary uninitialized worktree separately from a prepared worktree whose
  installed policy has drifted.

## State ownership contract

| Class | Artifacts | Rule |
|---|---|---|
| Repository policy, materialized per worktree | `.shield/config.json`, `.shield/trusted-human-bindings.json` | Snapshot only from the explicit source; validate semantic agreement; install exact bytes per destination; never reference mutable source paths at use time. |
| Deterministic destination scaffold | `.shield/.gitignore`, `.shield/worktree-state.json` | Generate locally from closed constants and the exact preparation receipt. Never copy these files from another worktree. |
| Destination-derived optional profile | `.shield/pipeline-profile.json` | Do not copy. Existing `shield init --starter-pipeline` may derive it from destination scripts in a later explicit operation. |
| Worktree/mission-local durable state | journals, reports, tmp, audit ledgers, dispatch receipts, May/Mack stores, preparation graphs, Feature Flight state | Never copy, link, share, merge, or rewrite across worktrees. |
| Host-local secret state | encrypted signer records and passcodes | Never read or copy. The receipt may record only public signing-key references already present in validated policy. |
| Non-authoritative context/cache | agent context, dependency caches, build outputs | Never treated as policy, evidence, or authority. Out of scope for this command. |

The Git common directory proves repository relationship only. It is never used
as a shared mutable SHIELD store.

## Public contract

Add `worktree-state-v1.mts` inside `@shield/team-system` and export it as
`@shield/team-system/worktree-state`. A separate Nx library is not justified:
the first consumers and all required filesystem/Git/config contracts are
already Team System surfaces, and extraction would broaden this correction.

### Preparation request

The closed request contains only:

- `sourceRoot`: canonical absolute path supplied by the host;
- `destinationRoot`: canonical absolute path supplied by the host.

No caller supplies repository identity, branch, HEAD, bytes, digests, paths,
binding identities, or readiness.

### Source observation

Retained no-follow descriptors capture exact bytes and identity for:

- `.shield/config.json`;
- `.shield/trusted-human-bindings.json`.

The implementation validates the config, closed trusted-binding registry, and
bidirectional exact agreement: every configured binding reference resolves to
exactly one registry row, and every registry row is referenced by the config.
`bindingId` and `signingKeyRef` are each globally unique across the registry;
cross-seat reuse is malformed rather than silently accepted.
It records SHA-256 digests of the exact bytes and semantic projections. A
symlink, non-regular file, duplicate binding, unsupported schema, malformed
bytes, or post-capture identity/byte drift blocks before destination mutation.

### Repository observation

Using a closed Git subprocess environment containing only the observed
executable `PATH`, `LANG=C`, and `LC_ALL=C` (with no inherited Git context
variables), observe both roots:

- canonical top-level root;
- canonical `git rev-parse --git-common-dir`;
- normalized origin repository identity;
- attached branch or detached state;
- exact HEAD;
- porcelain status.

Both roots must be distinct registered worktrees, share the same canonical Git
common directory and normalized origin identity, and match the source config's
repository ID. The destination must be attached to a branch and clean before
the first preparation. Detached, dirty, aliased, nested, missing, stale, or
foreign roots return stable blocked reasons with no writes. Source and
destination HEADs need not be equal because repository policy is not revision
authority; both exact observations remain in the receipt.

### Destination materialization

The only created or validated destination files are:

1. `.shield/.gitignore` with the existing canonical contents;
2. `.shield/config.json` with the exact captured source bytes;
3. `.shield/trusted-human-bindings.json` with the exact captured source bytes;
4. `.shield/worktree-state.json`, a canonical JSON receipt plus one LF.

The lock and create-only temporary files are staging artifacts only. They are
never final prepared state and never appear in `installedPaths`.

The materializer:

- retains and verifies the destination root directory identity;
- rejects symlinked/non-directory `.shield` and every unsafe final component;
- uses a destination-scoped exclusive lock and create-only `O_NOFOLLOW`
  temporaries;
- writes exact bytes, fsyncs files and containing directories in creation
  order, installs without overwrite, and reopens every installed file with
  no-follow exact identity/mode/size/byte readback;
- revalidates source bytes, config, Git common directory, origins, destination
  branch/HEAD/clean state, and lock ownership before installation and before
  returning ready;
- never compensates by deleting an uncertain installed file. Uncertain write,
  rename, sync, readback, or lock release returns `recovery_required`.

Fault outcomes are closed: a proven pre-install failure is safely retryable; a
proven complete exact installation replays as `already_prepared`; only an
uncertain filesystem or durability outcome returns `recovery_required`.

Existing exact files with a valid matching receipt return `already_prepared`
without rewriting bytes. Any partial, extra authority-bearing, or semantically
different existing state returns a stable conflict/recovery result; the caller
cannot choose which state wins.

### Receipt

The immutable authority-none receipt contains:

- schema/version and `state: ready | already_prepared | blocked |
  recovery_required`;
- stable reason code and actionable safe summary;
- source and destination canonical roots, common-Git identity, repository ID,
  origins, branches, and observed HEADs;
- exact source config/registry byte digests and installed byte digests;
- public binding IDs, seats, and signing-key references only;
- destination installed paths and exact receipt digest;
- explicit exclusions: journals, evidence, signers, caches, authority, mission
  begin/authorization, model invocation, Git publication, merge, deployment,
  release, and cleanup.

The receipt is provenance for a materialization operation, not mission
authority. Mission preparation must independently reobserve current branch,
HEAD, cleanliness, journal, and signer state. Later commits do not invalidate
the historical preparation receipt when installed policy bytes remain exact.
`receiptDigest` is SHA-256 over the canonical receipt fields with
`receiptDigest` itself omitted, preventing a self-referential digest contract.

## Doctor behavior

Extend doctor without weakening existing healthy repositories:

- missing `.shield/config.json` and no worktree receipt:
  `uninitialized_worktree` with the exact prepare/init action;
- valid manually initialized policy and no worktree receipt:
  `manual_policy_present`, healthy under existing rules;
- valid matching worktree receipt and installed bytes:
  `prepared_worktree`, healthy;
- malformed receipt, unsafe path, installed-byte/digest mismatch, repository
  mismatch, or impossible provenance:
  `stale_or_malformed_worktree_state`, unhealthy and fail closed.

Doctor never repairs, copies, or selects a source.

## CLI

Add:

```text
shield worktree prepare --source-root <path> --root <destination> [--json]
```

Success prints only `READY` or `ALREADY PREPARED`, destination, repository,
branch, HEAD, and receipt digest. Failure prints one stable reason and next
operator action. JSON emits the complete closed receipt. No PIN is requested:
this command copies validated public repository policy but grants no mission or
effect authority.

## Rapid-strike packets under one mission

Packets are checkpoints under one Wheels Up phase, not separate missions or
human gates.

### Packet A — AC-1/AC-2: ownership and observations

- Add the closed state taxonomy, request/receipt types, source policy snapshot,
  Git/common-dir observation, canonical digests, and hostile-input tests.
- Red proves ordinary worktrees lack deterministic state and caller-asserted
  identity cannot enter the receipt.

### Packet B — AC-3/AC-4/AC-7: safe materialization and replay

- Add exact four-file destination materialization, no-follow durability,
  idempotent exact retry, conflict, concurrency, and recovery behavior.
- Prove every mission/secret/cache path is excluded and unchanged.

### Packet C — AC-5/AC-6: doctor and consumer boundary

- Add doctor classification and the public ready/blocked receipt export.
- Prove mission preparation can consume the receipt only as non-authoritative
  provenance and still reobserves all live mission/repository facts.

### Packet D — AC-8/AC-9: integrated matrix and fallback

- Exercise real linked worktrees, detached destination rejection, dirty roots,
  stale/config drift, symlink/FIFO/hardlink substitution, interruption, exact
  retry, and two concurrently prepared lanes.
- Document one supported manual `shield init` fallback and its limitations
  until Feature Flight construction calls the preparer.

## Initial implementation paths

- `docs/operations/worktree-state.md`
- `packages/shield-team-system/package.json`
- `packages/shield-team-system/src/cli.mts`
- `packages/shield-team-system/src/config.mts`
- `packages/shield-team-system/src/worktree-state-v1.mts`
- `packages/shield-team-system/tests/cli.test.mjs`
- `packages/shield-team-system/tests/config.test.mjs`
- `packages/shield-team-system/tests/mission-preparation-host-v1.test.mjs`
- `packages/shield-team-system/tests/package-surface.test.mjs`
- `packages/shield-team-system/tests/worktree-state-v1.test.mjs`

The reviewed plan is not a May write path. The existing mission-preparation
host implementation is also excluded because this slice changes no host
behavior; its focused test remains only as no-regression consumer evidence.

Fury may remove paths or require a smaller child split. No implementation path
is authorized by this plan.

## Validation

- focused worktree-state contract and fault-injection tests;
- focused CLI and doctor tests;
- mission-preparation consumer tests;
- package-surface strict TypeScript/import tests;
- real-process linked-worktree integration tests in disposable directories;
- `npm exec -- nx run @shield/team-system:build --skipNxCache`;
- `npm exec -- nx run @shield/team-system:test --skipNxCache`;
- exact-base/head `npm exec -- nx affected -t build,test` with external
  Multiband build requirements reported separately rather than fabricated;
- `git diff --check` and exact changed-path allowlist.

## Exclusions

- No state under the Git common directory.
- No copied/shared journals, evidence, receipts, signers, passcodes, caches, or
  model context.
- No new authority class or human decision.
- No automatic mission begin, Wheels Up, runtime binding, publication, merge,
  deployment, release, ready-for-review, or cleanup.
- No Feature Flight construction implementation, Guided QA implementation, or
  generic repository installer.
- No new Nx library in this mission.
