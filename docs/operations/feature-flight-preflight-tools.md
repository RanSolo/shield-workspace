# Feature Flight preflight tools

Use these observational tools before any child mission receives implementation
authority. They compile and verify non-authoritative construction evidence;
they do not create branches, worktrees, journals, bindings, approvals, merges,
deployments, or releases.

## Prepare a closed flight package

```bash
node packages/shield-team-system/scripts/operations/ops-cli.mjs flight prep /absolute/path/to/manifest.json \
  --output /absolute/path/to/new-package
```

The closed version 1 manifest pins `repository.path`, `baseRef`, and the exact
40-character `baseRevision`. Integration and mission branches must pass
`git check-ref-format --branch` and must be role-distinct. Every mission keeps
its semantic `id` and separately supplies the exact derived lowercase `slug`;
slugs must be unique and are the only mission-derived values used in packet or
evidence filenames.

Writable ownership paths use canonical POSIX-relative syntax. Absolute paths,
empty paths, `.`, `..`, backslashes, repeated separators, traversal, aliases,
and non-terminal wildcards are rejected. A terminal `/**` is the only ownership
glob. The tool canonicalizes existing repository paths with `realpath`, resolves
absent worktree targets as canonical parent plus basename, rejects controlled
output symlink components, and treats the macOS `/var` and `/private/var`
spellings as one filesystem identity.

Preparation requires the base ref to resolve to the supplied revision, that
revision to exist and be an ancestor of HEAD, and preparation-phase HEAD to
equal it exactly. When `origin` is a network remote, the plan's closed
`repository.remoteUrl` field records only its credential-free host/repository
identity; URL usernames, passwords, queries, fragments, and raw remote URLs are
never persisted. Only `git`, `http`, `https`, `ssh`, and local `file` URL
protocols plus canonical scp-like remotes are accepted; ambiguous or malformed
network remotes fail closed without being echoed. Local-path remotes are
recorded as `null`.

Package writes are create-only and confined beneath a private mode `0700`
sibling staging directory. Complete artifacts and directories are synced,
staging is atomically renamed to the final root, and the parent directory is
synced. Because portable Node filesystem APIs do not provide an absolute
no-replace directory rename, Linux/WSL publication uses GNU `mv` with
`--no-copy`, `--no-clobber`, and `--no-target-directory` to reach the
kernel-native create-only move path; the tool fails closed on platforms without
this primitive. This prevents even a non-cooperating writer from having an
empty destination replaced after the last existence check. Success additionally
requires the staging path to disappear and the final directory to retain the
staged inode, so a successful no-clobber no-op is not mistaken for publication.
Cooperating flight-prep processes additionally acquire an atomic
create-exclusive sibling `.OUTPUT.publish.lock` reservation.

A pre-publication failure removes only owned staging state. Both acquisition-
failure and normal lock cleanup move the reservation to an unguessable
quarantine name and verify its inode before deletion, avoiding deletion of a
raced replacement entry. A replacement detected after the cleanup identity
check remains quarantined rather than being deleted. After an interrupted
process, operators must verify no publisher is active before removing a stale
reservation. If the final rename succeeds but parent-directory durability sync
fails, the tool reports explicitly that the complete package was published and
does not remove it. The package contains a closed resolved plan, evaluation
contract, mission packets/templates, and a bootstrap receipt with a nonempty
exact generated-file inventory.

## Build the shared synthetic fixture

```bash
node packages/shield-team-system/scripts/operations/ops-cli.mjs fixture build --output /absolute/path/to/new-fixture
```

Ghostscript availability and version are checked before any output directory is
created. The fixture is built in a private mode `0700` sibling staging
directory. Files and closed evidence are synced, staging is atomically renamed
to the final root, and the parent directory is synced. Failure removes owned
staging state and leaves no published partial fixture.

To bind a fixture to a flight, add a closed `fixture-binding.json` beside the
resolved plan with these exact fields: `schemaVersion`, `bindingType`,
`authority`, `flightId`, `fixtureId`, `fixtureVersion`, `classification`,
`containsCustomerData`, `manifestPath`, and `manifestSha256`. Version 1 uses
`bindingType:feature-flight-fixture-binding` and `authority:none`.

## Verify construction

```bash
node packages/shield-team-system/scripts/operations/ops-cli.mjs construction check \
  --plan /absolute/path/to/flight-plan.resolved.json \
  --require-created \
  --output /absolute/path/to/new-construction-report.json
```

Without `--require-created`, absent worktrees are reported but are not failures.
Existing worktrees must have the exact canonical identity, role branch, clean
state, required ancestry, and phase HEAD equal to the planned base revision.
Repository, base-ref, base-revision, ancestry, and HEAD drift are reported
explicitly.

## Diagnose the complete package

```bash
node packages/shield-team-system/scripts/operations/ops-cli.mjs flight doctor \
  --plan /absolute/path/to/flight-plan.resolved.json \
  --output /absolute/path/to/new-doctor-report.json
```

Doctor requires the bootstrap receipt, exact nonempty generated-file inventory,
closed evaluation contract, and fixture binding. It snapshots each content
input once, rejects unknown fields, missing or extra package files, absolute or
traversing inventory entries, symlinked entries, changed byte counts/digests,
fixture closure drift, and repository/construction drift. Report outputs should
be outside the package so they do not become unbound extra files.

A healthy construction or doctor report is structural, observational evidence
only. It is not Wheels Up, provenance, execution attestation, approval, or
permission to act.

After preflight, continue with [Feature Flight control tools](./feature-flight-control-tools.md).
