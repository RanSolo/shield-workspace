# Preparing deterministic SHIELD state in a Git worktree

`shield worktree prepare` materializes repository policy in one new Git
worktree. It is an authority-neutral preparation operation: it does not begin a
mission, authorize implementation, invoke a model, publish Git state, or copy
mission or secret data.

## Supported command

Run the command with two explicit, canonical worktree roots:

```text
shield worktree prepare \
  --source-root /absolute/path/to/governed-source \
  --root /absolute/path/to/new-destination
```

Add `--json` to receive the closed `worktree.state.v1` result. A successful
human result starts with `READY` or `ALREADY PREPARED` and reports only the
destination, repository, branch, HEAD, and receipt digest. The command never
requests a PIN or passcode.

The source and destination must be distinct registered worktrees of the same
Git repository. Their canonical Git common directory and normalized `origin`
identity must agree with the source `.shield/config.json`. The destination must
be attached to a branch and clean. Source and destination HEADs may differ.

## Materialized state

Preparation snapshots and semantically cross-checks these source policy files:

- `.shield/config.json`
- `.shield/trusted-human-bindings.json`

Every configured binding reference must resolve to exactly one registry row,
every registry row must be configured, and binding IDs and signing-key
references must be globally unique. Exact source bytes are retained and
revalidated throughout the operation.

The destination receives exactly four files:

- `.shield/.gitignore`, generated from the fixed SHIELD scaffold;
- `.shield/config.json`, copied byte-for-byte from the retained source file;
- `.shield/trusted-human-bindings.json`, copied byte-for-byte from the retained
  source file;
- `.shield/worktree-state.json`, the canonical immutable preparation receipt.

The implementation uses no-follow retained descriptors, an exclusive
destination lock, create-only temporary files, no-overwrite installation,
file and directory synchronization, and exact final readback. Exact replay
returns `already_prepared` without rewriting any installed byte. Partial,
foreign, unsafe, or drifted state fails closed.

The receipt contains only public policy provenance: repository observations,
policy and installed-byte digests, public binding IDs, seats, and signing-key
references. Its `authority` is always `none`. The receipt digest is SHA-256 of
the canonical receipt fields with `receiptDigest` omitted.

Preparation never copies or shares journals, evidence, mission reports,
dispatch state, signer records, passcodes, caches, model context,
`pipeline-profile.json`, or any Git-common-directory state. Mission preparation
does not consume this receipt in this slice. The exported receipt is public
non-authoritative provenance only; any future consumer must independently
reobserve branch, HEAD, cleanliness, journals, signers, and current authority.

## Doctor classifications

`shield doctor` reports one closed worktree-state classification:

- `uninitialized_worktree`: no configuration or preparation receipt exists;
- `manual_policy_present`: valid manually initialized policy exists without a
  preparation receipt;
- `prepared_worktree`: the receipt, installed bytes, and repository identity
  are exact;
- `stale_or_malformed_worktree_state`: provenance or installed policy is
  malformed, unsafe, drifted, partial, or belongs to another repository.

Doctor is read-only. It does not select a source or repair prepared state.

## Failure and recovery

A `blocked` result is a proven pre-install failure and is safe to retry after
the named condition is corrected. `preparation_in_progress` means another
preparer owns the destination lock.

A `recovery_required` result means a filesystem, durability, readback, or lock
release outcome became uncertain after installation could have begun. Stop
automated retries and inspect the destination `.shield` directory using
identity-safe operator procedures. Do not delete or overwrite uncertain files.
If all four exact files were durably installed despite an interruption, a later
exact replay classifies them as `already_prepared`.

## Manual fallback

Until Feature Flight construction invokes the preparer, the supported fallback
is an explicit destination-local initialization:

```text
shield init \
  --repository-id owner/name \
  --coulson-binding-ref '<public-binding-ref>' \
  --fitz-binding-ref '<public-binding-ref>' \
  --root /absolute/path/to/destination
```

This fallback creates local configuration and `.shield/.gitignore`; it does not
snapshot or install `.shield/trusted-human-bindings.json`, does not create a
worktree preparation receipt, and cannot prove byte identity with another
worktree. Doctor therefore reports `manual_policy_present`. Provision the
trusted binding registry through the existing governed repository-policy
process before mission operations that require it.
